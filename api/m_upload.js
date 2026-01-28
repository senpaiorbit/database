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

  /* ===== DB PING ===== */
  if (req.method === "GET" && req.query.ping) {
    try {
      const c = await pool.connect();
      c.release();
      return res.json({
        db_connect: true,
        inserted: 0,
        skipped: 0,
        logs: []
      });
    } catch (e) {
      return res.json({
        db_connect: false,
        inserted: 0,
        skipped: 0,
        error: e.message,
        logs: []
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only",
      inserted: 0,
      skipped: 0,
      logs: []
    });
  }

  let inserted = 0;
  let skipped = 0;
  const logs = [];

  try {
    const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
    const [, files] = await form.parse(req);

    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({
        error: "File missing",
        inserted,
        skipped,
        logs
      });
    }

    const raw = fs.readFileSync(file.filepath, "utf8");
    const json = JSON.parse(raw);

    if (!Array.isArray(json.movies)) {
      return res.status(400).json({
        error: "movies[] missing",
        inserted,
        skipped,
        logs
      });
    }

    const movies = json.movies.slice(0, 20); // serverless safety
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      logs.push("DB connected ✔");

      const clean = v =>
        typeof v === "string" ? v.replace(/[\[\]\(\)]/g, "") : null;

      for (const m of movies) {
        if (!m?.tmdb_id || !m?.title) {
          skipped++;
          logs.push("Skipped: missing tmdb_id/title");
          continue;
        }

        const ex = await client.query(
          "SELECT 1 FROM movies WHERE tmdb_id=$1",
          [m.tmdb_id]
        );
        if (ex.rowCount) {
          skipped++;
          logs.push(`Skipped existing TMDB ${m.tmdb_id}`);
          continue;
        }

        const poster = await client.query(
          "INSERT INTO images (tmdb,url) VALUES (false,$1) RETURNING id",
          [clean(m.poster)]
        );

        let backdropId = null;
        if (m.backdrop?.header) {
          const b = await client.query(
            "INSERT INTO images (tmdb,url) VALUES (false,$1) RETURNING id",
            [clean(m.backdrop.header)]
          );
          backdropId = b.rows[0].id;
        }

        let srcId = null;
        if (m.iframes?.[0]?.src) {
          const s = await client.query(
            "INSERT INTO src (url) VALUES ($1) RETURNING id",
            [clean(m.iframes[0].src)]
          );
          srcId = s.rows[0].id;
        }

        await client.query(
          `INSERT INTO movies
          (tmdb_id,title,overview,genres,rating,release_date,
           poster_img_id,backdrop_img_id,src_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            m.tmdb_id,
            m.title,
            m.description || null,
            m.genres || [],
            Math.round((m.rating || 0) * 10),
            m.year ? `${m.year}-01-01` : null,
            poster.rows[0].id,
            backdropId,
            srcId
          ]
        );

        inserted++;
        logs.push(`Inserted: ${m.title}`);
      }

      await client.query("COMMIT");
      client.release();

      return res.json({
        success: true,
        inserted,
        skipped,
        logs
      });

    } catch (dbErr) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(500).json({
        error: "DB_ERROR",
        message: dbErr.message,
        inserted,
        skipped,
        logs
      });
    }

  } catch (fatal) {
    return res.status(500).json({
      error: "FATAL_ERROR",
      message: fatal.message,
      inserted,
      skipped,
      logs
    });
  }
}
