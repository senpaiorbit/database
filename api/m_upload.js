export const config = {
  runtime: "nodejs",
  maxDuration: 10
};

import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    /* =====================
       DB STATUS CHECK
    ===================== */
    if (req.method === "GET" && req.query.ping) {
      try {
        const c = await pool.connect();
        await c.query("SELECT 1");
        c.release();
        return res.json({ db_connect: true });
      } catch (e) {
        return res.json({
          db_connect: false,
          reason: "IPv4 / Pooler / ENV issue",
          error: e.message
        });
      }
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    let body;
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (!Array.isArray(body.movies)) {
      return res.status(400).json({ error: "movies[] missing" });
    }

    // 🚫 HARD LIMIT to avoid timeout
    const movies = body.movies.slice(0, 20);

    const client = await pool.connect();
    const logs = [];
    let inserted = 0;
    let skipped = 0;

    try {
      await client.query("BEGIN");
      logs.push("DB connected ✔");

      for (const m of movies) {
        if (!m?.tmdb_id || !m?.title) {
          skipped++;
          continue;
        }

        const exists = await client.query(
          "SELECT 1 FROM movies WHERE tmdb_id=$1",
          [m.tmdb_id]
        );
        if (exists.rowCount) {
          skipped++;
          continue;
        }

        const clean = v =>
          typeof v === "string"
            ? v.replace(/[\[\]\(\)]/g, "")
            : null;

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
        error: "DB_TRANSACTION_FAILED",
        message: dbErr.message,
        logs
      });
    }

  } catch (fatal) {
    return res.status(500).json({
      error: "FATAL_FUNCTION_ERROR",
      message: fatal.message
    });
  }
}
