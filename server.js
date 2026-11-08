import express from 'express';
import cors from 'cors';
import { pool } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Rutas de autenticación
app.use('/api/auth', authRoutes);

app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'ok', db_time: result.rows[0].now });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor HTTP activo en http://localhost:${PORT}`);
});
