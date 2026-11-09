import { pool } from '../src/config/db.js';

const sql = `
CREATE TABLE IF NOT EXISTS notificaciones_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo VARCHAR(120) NOT NULL,
    mensaje TEXT NOT NULL,
    tipo VARCHAR(50) DEFAULT 'ADVERTENCIA',
    leido BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones_usuario(usuario_id);
`;

const ejecutar = async () => {
    try {
        console.log('Iniciando verificación/creación de tabla notificaciones_usuario...');
        await pool.query(sql);
        console.log('✔ Tabla e índice notificaciones_usuario verificados/creados correctamente en la base de datos.');

        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('Tablas actuales en la base de datos:', res.rows.map(r => r.table_name));
        process.exit(0);
    } catch (error) {
        console.error('✖ Error al ejecutar migración:', error);
        process.exit(1);
    }
};

ejecutar();

