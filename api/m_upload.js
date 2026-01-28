import { IncomingForm } from "formidable";
import fs from "fs";
import { Pool } from "pg";

export const config = {
  api: { bodyParser: false }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const CHUNK_SIZE = 50; // ✅ safe size for Vercel

function clean(v) {
  if (typeof v === "string") {
    return v.replace(/[\[\]\(\)]/g, "");
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const form = new IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Upload failed" });

    const file = files.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    let inserted = 0;
    let skipped = 0;

    try {
      const raw = fs.readFileSync(file.filepath, "utf-8");
      const data = JSON.parse(raw);
      const movies = data.movies || [];

      const client = await pool.connect();

      try {
        for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
          const chunk = movies.slice(i, i + CHUNK_SIZE);

          await client.query("BEGIN");

          for (const m of chunk) {
            if (!m.tmdb_id || !m.title) {
              skipped++;
              continue;
            }

            const exists = await client.query(
              "SELECT 1 FROM movies WHERE tmdb_id=$1",
              [m.tmdb_id]
            );

            if (exists.rowCount > 0) {
              skipped++;
              continue;
            }

            // poster
            const posterRes = await client.query(
              "INSERT INTO images (tmdb, url) VALUES (false, $1) RETURNING id",
              [clean(m.poster)]
            );
            const posterId = posterRes.rows[0].id;

            // backdrop
            let backdropId = null;
            if (m.backdrop?.header) {
              const backRes = await client.query(
                "INSERT INTO images (tmdb, url) VALUES (false, $1) RETURNING id",
                [clean(m.backdrop.header)]
              );
              backdropId = backRes.rows[0].id;
            }

            // src
            let srcId = null;
            if (m.iframes?.length) {
              const srcRes = await client.query(
                "INSERT INTO src (url) VALUES ($1) RETURNING id",
                [clean(m.iframes[0].src)]
              );
              srcId = srcRes.rows[0].id;
            }

            await client.query(
              `INSERT INTO movies
              (tmdb_id, title, overview, genres, rating, release_date,
               poster_img_id, backdrop_img_id, src_id)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                m.tmdb_id,
                m.title,
                m.description || null,
                [],
                Math.round((m.rating || 0) * 10),
                `${m.year || "2000"}-01-01`,
                posterId,
                backdropId,
                srcId
              ]
            );

            inserted++;
          }

          await client.query("COMMIT");

          // ⏸️ short pause to avoid DB overload
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        inserted,
        skipped,
        total: movies.length
      });

    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "JSON or DB error" });
    }
  });
}
