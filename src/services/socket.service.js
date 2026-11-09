import { Server } from 'socket.io';
import { verificarToken } from '../utils/jwt.js';

let io = null;

export const inicializarSocket = (serverHttp) => {
    io = new Server(serverHttp, {
        cors: {
            origin: (origin, callback) => {
                if (
                    !origin ||
                    /^http:\/\/localhost:\d+$/.test(origin) ||
                    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
                    origin.endsWith('.vercel.app') ||
                    origin === process.env.CLIENT_URL
                ) {
                    return callback(null, true);
                }
                return callback(new Error(`Bloqueado por CORS en WebSockets: ${origin}`));
            },
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // Middleware de Autenticación de Socket
    io.use((socket, next) => {
        try {
            let token = socket.handshake.auth?.token;

            if (!token && socket.handshake.headers?.authorization) {
                const authHeader = socket.handshake.headers.authorization;
                if (authHeader.startsWith('Bearer ')) {
                    token = authHeader.split(' ')[1];
                } else {
                    token = authHeader;
                }
            }

            if (!token) {
                return next(new Error('Autenticacion requerida'));
            }

            let payload;
            try {
                payload = verificarToken(token);
            } catch (err) {
                return next(new Error('Autenticacion requerida'));
            }

            if (!payload || payload.etapa !== 'completa') {
                return next(new Error('Autenticacion requerida'));
            }

            socket.usuario = payload;
            next();
        } catch (error) {
            next(new Error('Autenticacion requerida'));
        }
    });

    // Manejo de Conexiones y Salas (Rooms)
    io.on('connection', (socket) => {
        const usuario = socket.usuario;

        if (usuario?.rol === 'OPERADOR_ENTIDAD' && usuario.entidad_id) {
            socket.join(`entidad:${usuario.entidad_id}`);
        }

        if (usuario?.rol === 'SUPER_ADMIN') {
            socket.join('admin:global');
        }

        socket.join('incidentes:general');
    });

    return io;
};

export const getIO = () => io;

export const notificarIncidenteCreado = (incidente) => {
    if (!io || !incidente) return;
    io.to(`entidad:${incidente.entidad_asignada_id}`)
      .to('admin:global')
      .emit('incidente:creado', incidente);
};

export const notificarCambioEstado = ({ incidenteId, entidadId, nuevoEstado, historial }) => {
    if (!io) return;
    io.to('incidentes:general').emit('incidente:estado_actualizado', {
        incidenteId,
        entidadId,
        nuevoEstado,
        historial
    });
};

export const notificarConfirmacion = ({ incidenteId, entidadId, nuevoContador }) => {
    if (!io) return;
    io.to('incidentes:general').emit('incidente:confirmado', {
        incidenteId,
        entidadId,
        nuevoContador
    });
};
