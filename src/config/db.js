import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Verificación inicial de conexión
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('✖ Error al conectar con PostgreSQL en Supabase:', err.message);
    } else {
        console.log('✔ Conexión exitosa a PostgreSQL en Supabase:', res.rows[0].now);
    }
});