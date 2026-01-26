import { Pool } from "pg";

const pool = new Pool({
  host: "db.boqfijmhywxsqqbhyyiq.supabase.co",
  user: "postgres",
  password: process.env.db_pass, // set in Vercel ENV
  database: "postgres",
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let payload;
  try {
    payload = req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (!payload.movies || !Array.isArray(payload.movies)) {
    return res.status(400).json({ error: "No movies array" });
  }

  const client = await pool.connect();
  let inserted = 0, skipped = 0;

  try {
    await client.query("BEGIN");

    for (const m of payload.movies) {
      if (!m.tmdb_id || !m.title) {
        skipped++;
        continue;
      }

      const exists = await client.query(
        "SELECT id FROM movies WHERE tmdb_id=$1",
        [m.tmdb_id]
      );
      if (exists.rowCount) {
        skipped++;
        continue;
      }

      // poster image
      const poster = await client.query(
        "INSERT INTO images (tmdb, url) VALUES (false,$1) RETURNING id",
        [m.poster.replace(/[\[\]\(\)]/g, "")]
      );

      // backdrop image
      const backdropUrl = m.backdrop?.header
        ? m.backdrop.header.replace(/[\[\]\(\)]/g, "")
        : null;

      let backdropId = null;
      if (backdropUrl) {
        const b = await client.query(
          "INSERT INTO images (tmdb, url) VALUES (false,$1) RETURNING id",
          [backdropUrl]
        );
        backdropId = b.rows[0].id;
      }

      // src (first iframe only)
      let srcId = null;
      if (m.iframes?.length) {
        const s = await client.query(
          "INSERT INTO src (url) VALUES ($1) RETURNING id",
          [m.iframes[0].src.replace(/[\[\]\(\)]/g, "")]
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
    }

    await client.query("COMMIT");
    res.json({ success:true, inserted, skipped });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
