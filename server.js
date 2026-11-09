import http from 'http';
import express from 'express';
import cors from 'cors';
import { pool } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import entidadesRoutes from './src/routes/entidades.routes.js';
import incidentesRoutes from './src/routes/incidentes.routes.js';
import { inicializarSocket } from './src/services/socket.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de entidades y catálogo
app.use('/api/entidades', entidadesRoutes);

// Rutas de incidentes
app.use('/api/incidentes', incidentesRoutes);

app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'ok', db_time: result.rows[0].now });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

const serverHttp = http.createServer(app);
const io = inicializarSocket(serverHttp);

if (process.env.NODE_ENV !== 'test') {
    serverHttp.listen(PORT, () => {
        console.log(`Servidor HTTP activo en http://localhost:${PORT}`);
    });
}

export { app, serverHttp, io };
export default app;
