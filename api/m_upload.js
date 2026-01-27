import { Pool } from "pg";

const pool = new Pool({
  host: "db.boqfijmhywxsqqbhyyiq.supabase.co",
  user: "postgres",
  password: process.env.db_pass,
  database: "postgres",
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  // 🔍 DB PING
  if (req.method === "GET" && req.query.ping) {
    try {
      const c = await pool.connect();
      c.release();
      return res.status(200).json({ db_connect: true });
    } catch (e) {
      return res.status(200).json({ db_connect: false, error: e.message });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  if (!Array.isArray(body.movies)) {
    return res.status(400).json({ error: "movies[] missing" });
  }

  const client = await pool.connect();
  let inserted = 0, skipped = 0;
  const logs = [];

  try {
    await client.query("BEGIN");
    logs.push("DB connected ✔");

    for (const m of body.movies) {
      if (!m.tmdb_id || !m.title) {
        skipped++;
        logs.push(`Skipped: missing tmdb_id/title`);
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

      const clean = v => v?.replace(/[\[\]\(\)]/g, "") || null;

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
    return res.json({ success:true, inserted, skipped, logs });

  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: e.message, logs });
  } finally {
    client.release();
  }
}
