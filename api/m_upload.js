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

const CHUNK_SIZE = 50;

function clean(v) {
  if (typeof v === "string") {
    return v.replace(/[\[\]\(\)]/g, "");
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("POST only");
  }

  const logs = [];
  const log = (msg) => logs.push(msg);

  log("upload_start: true");

  const form = new IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      log("upload_parse_error: true");
      return res.send(logs.join("\n"));
    }

    const file = files.file;
    if (!file) {
      log("file_found: false");
      return res.send(logs.join("\n"));
    }

    let movies = [];
    let inserted = 0;
    let skipped = 0;
    let tryNo = 0;

    try {
      const raw = fs.readFileSync(file.filepath, "utf-8");
      const data = JSON.parse(raw);
      movies = data.movies || [];

      log("json_loaded: true");
      log(`total_movies: ${movies.length}`);
    } catch {
      log("json_loaded: false");
      return res.send(logs.join("\n"));
    }

    let client;
    try {
      client = await pool.connect();
      log("db_connect: true");
    } catch {
      log("db_connect: false");
      return res.send(logs.join("\n"));
    }

    try {
      for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
        const chunk = movies.slice(i, i + CHUNK_SIZE);
        log(`chunk_start: ${i + 1} - ${i + chunk.length}`);

        await client.query("BEGIN");

        for (const m of chunk) {
          tryNo++;
          log(`try_no: ${tryNo}`);

          if (!m.tmdb_id || !m.title) {
            skipped++;
            log("add_to_db: false (missing data)");
            continue;
          }

          const exists = await client.query(
            "SELECT 1 FROM movies WHERE tmdb_id=$1",
            [m.tmdb_id]
          );

          if (exists.rowCount > 0) {
            skipped++;
            log("add_to_db: false (already exists)");
            continue;
          }

          const posterRes = await client.query(
            "INSERT INTO images (tmdb, url) VALUES (false, $1) RETURNING id",
            [clean(m.poster)]
          );
          const posterId = posterRes.rows[0].id;

          let backdropId = null;
          if (m.backdrop?.header) {
            const backRes = await client.query(
              "INSERT INTO images (tmdb, url) VALUES (false, $1) RETURNING id",
              [clean(m.backdrop.header)]
            );
            backdropId = backRes.rows[0].id;
          }

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
          log("add_to_db: true");
        }

        await client.query("COMMIT");
        log("chunk_commit: true");

        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      await client.query("ROLLBACK");
      log("chunk_commit: false");
      log(`error: ${e.message}`);
    } finally {
      client.release();
    }

    log("process_done: true");
    log(`inserted: ${inserted}`);
    log(`skipped: ${skipped}`);

    res.setHeader("Content-Type", "text/plain");
    res.send(logs.join("\n"));
  });
}
