import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (!Array.isArray(body.movies)) {
    return { statusCode: 400, body: 'Missing movies array' };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const m of body.movies) {
      if (!m.title || !m.tmdb_id) continue;

      const posterRes = await client.query(
        `INSERT INTO images (tmdb, url)
         VALUES (true, $1)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [m.poster.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/\w+\//, '')]
      );

      const posterId = posterRes.rows[0]?.id ?? null;

      await client.query(
        `INSERT INTO movies
         (tmdb_id, title, overview, genres, rating, release_date, poster_img_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tmdb_id) DO NOTHING`,
        [
          m.tmdb_id,
          m.title,
          m.description,
          m.genres || [],
          Math.round((m.rating || 0) * 10),
          `${m.year}-01-01`,
          posterId
        ]
      );
    }

    await client.query('COMMIT');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted: body.movies.length
      })
    };

  } catch (err) {
    await client.query('ROLLBACK');
    return {
      statusCode: 500,
      body: err.message
    };
  } finally {
    client.release();
  }
         }
