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

  if (req.method === "GET" && req.query.ping) {
    try {
      const c = await pool.connect();
      c.release();
      return res.json({ db_connect: true, inserted: 0, skipped: 0, logs: [] });
    } catch (e) {
      return res.json({ db_connect: false, inserted: 0, skipped: 0, logs: [] });
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

    const client = await pool.connect();
    await client.query("BEGIN");
    logs.push("DB connected ✔");

    const clean = v =>
      typeof v === "string" ? v.replace(/[\[\]\(\)]/g, "") : null;

    for (const m of movies) {
      const exists = await client.query(
        "SELECT id FROM movies WHERE tmdb_id=$1",
        [m.tmdb_id]
      );

      if (exists.rowCount > 0) {
        skipped++;
        logs.push(`Skipped existing tmdb_id=${m.tmdb_id}`);
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

    return res.json({ success: true, inserted, skipped, logs });

  } catch (e) {
    return res.json({ inserted, skipped, error: e.message, logs });
  }
}
