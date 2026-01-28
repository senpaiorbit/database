export const config = {
  runtime: "nodejs",
  maxDuration: 10,
  api: { bodyParser: false }
};

import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // DB ping
  if (req.method === "GET" && req.query.ping) {
    try {
      await pool.query("SELECT 1");
      return res.json({ db_connect: true, inserted: 0, skipped: 0, logs: [] });
    } catch (e) {
      return res.json({ db_connect: false, inserted: 0, skipped: 0, logs: [e.message] });
    }
  }

  let inserted = 0;
  let skipped = 0;
  const logs = [];

  try {
    const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.json({ inserted, skipped, logs });
    }

    const json = JSON.parse(fs.readFileSync(file.filepath, "utf8"));
    if (!Array.isArray(json.movies)) {
      return res.json({ inserted, skipped, logs });
    }

    const movies = json.movies.filter(m => m?.tmdb_id && m?.title);
    logs.push(`Valid movies found: ${movies.length}`);

    const clean = v =>
      typeof v === "string" ? v.replace(/[\[\]\(\)]/g, "") : null;

    for (const m of movies) {
      try {
        // poster
        const posterRes = await pool.query(
          `INSERT INTO images (tmdb, url)
           VALUES (false, $1)
           RETURNING id`,
          [clean(m.poster)]
        );
        const posterId = posterRes.rows[0].id;

        // backdrop
        let backdropId = null;
        if (m.backdrop?.header) {
          const b = await pool.query(
            `INSERT INTO images (tmdb, url)
             VALUES (false, $1)
             RETURNING id`,
            [clean(m.backdrop.header)]
          );
          backdropId = b.rows[0].id;
        }

        // src
        let srcId = null;
        if (m.iframes?.[0]?.src) {
          const s = await pool.query(
            `INSERT INTO src (url)
             VALUES ($1)
             RETURNING id`,
            [clean(m.iframes[0].src)]
          );
          srcId = s.rows[0].id;
        }

        // UPSERT movie (THIS IS THE KEY)
        const result = await pool.query(
          `INSERT INTO movies
           (tmdb_id, title, overview, genres, rating, release_date,
            poster_img_id, backdrop_img_id, src_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tmdb_id) DO NOTHING`,
          [
            m.tmdb_id,
            m.title,
            m.description || null,
            m.genres || [],
            Math.round((m.rating || 0) * 10),
            m.year ? `${m.year}-01-01` : null,
            posterId,
            backdropId,
            srcId
          ]
        );

        if (result.rowCount === 0) {
          skipped++;
          logs.push(`Skipped existing tmdb_id=${m.tmdb_id}`);
        } else {
          inserted++;
          logs.push(`Inserted: ${m.title}`);
        }

      } catch (rowErr) {
        skipped++;
        logs.push(`Row failed tmdb_id=${m.tmdb_id}: ${rowErr.message}`);
      }
    }

    return res.json({ success: true, inserted, skipped, logs });

  } catch (e) {
    return res.json({ inserted, skipped, error: e.message, logs });
  }
}
