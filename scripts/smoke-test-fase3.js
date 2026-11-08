process.env.NODE_ENV = 'test';

import http from 'http';
import { pool } from '../src/config/db.js';
import { firmarToken } from '../src/utils/jwt.js';

const { app } = await import('../server.js');

const PORT = 3099;
let server;

const request = async (method, path, body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    const res = await fetch(`http://localhost:${PORT}${path}`, options);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
};

const assert = (condition, message) => {
    if (!condition) {
        console.error(`❌ FALLÓ ASERCIÓN: ${message}`);
        throw new Error(message);
    }
    console.log(`  ✔ ${message}`);
};

const ejecutarPruebas = async () => {
    console.log('====================================================');
    console.log('   INICIANDO SMOKE TEST: FASE 3 VÍAALERTA BACKEND   ');
    console.log('====================================================\n');

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`[TEST HARNESS] Servidor de pruebas iniciado en puerto ${PORT}\n`);

    try {
        // 0. Preparar tokens para los diferentes perfiles
        const tokenCiudadano1 = firmarToken(
            { sub: 'dddddddd-dddd-dddd-dddd-dddddddddddd', rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenCiudadano2 = firmarToken(
            { sub: 'c289a950-719c-4fb5-902d-002016f2ce65', rol: 'CIUDADANO', etapa: 'completa' },
            '1h'
        );
        const tokenOperadorMML = firmarToken(
            { sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', rol: 'OPERADOR_ENTIDAD', etapa: 'completa' },
            '1h'
        );
        const tokenOperadorSEDAPAL = firmarToken(
            { sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc', rol: 'OPERADOR_ENTIDAD', etapa: 'completa' },
            '1h'
        );
        const tokenAdmin = firmarToken(
            { sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', rol: 'SUPER_ADMIN', etapa: 'completa' },
            '1h'
        );

        // -----------------------------------------------------------------
        // PRUEBA 1: Listar Catálogos (Entidades y Categorías)
        // -----------------------------------------------------------------
        console.log('--- TEST 1: Catálogos Públicos (/api/entidades) ---');
        const resEntidades = await request('GET', '/api/entidades', null, tokenCiudadano1);
        assert(resEntidades.status === 200, 'GET /api/entidades responde 200 OK');
        assert(Array.isArray(resEntidades.data) && resEntidades.data.length >= 2, 'Retorna lista de entidades públicas activas');
        assert(resEntidades.data.some(e => e.sigla === 'MML'), 'Entidad MML presente en el catálogo');
        assert(resEntidades.data.some(e => e.sigla === 'SEDAPAL'), 'Entidad SEDAPAL presente en el catálogo');

        const resCategorias = await request('GET', '/api/entidades/categorias', null, tokenCiudadano1);
        assert(resCategorias.status === 200, 'GET /api/entidades/categorias responde 200 OK');
        assert(Array.isArray(resCategorias.data) && resCategorias.data.length >= 5, 'Retorna categorías de incidentes');
        assert(resCategorias.data.some(c => c.id === 'CAT-01' && c.nombre.includes('Bache')), 'Categoría CAT-01 (Bache) presente');
        console.log('✓ TEST 1 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 2: Crear Incidente como Ciudadano 1
        // -----------------------------------------------------------------
        console.log('--- TEST 2: Creación de Incidente por Ciudadano ---');
        const nuevoIncidentePayload = {
            categoria_id: 'CAT-01', // Asignado a MML
            latitud: -12.046374,
            longitud: -77.042793,
            direccion_referencial: 'Av. Abancay cdra 5, Cercado de Lima',
            distrito: 'Cercado de Lima',
            severidad: 'ALTA',
            observaciones_ciudadano: 'Bache profundo cerca al cruce peatonal',
            ia_diagnostico: 'Deterioro severo en carpeta asfáltica',
            ia_confianza: 92.50,
            ia_severidad: 'ALTA',
            ia_recomendacion: 'Reparación asfáltica inmediata'
        };

        const resCrear = await request('POST', '/api/incidentes', nuevoIncidentePayload, tokenCiudadano1);
        assert(resCrear.status === 201, 'POST /api/incidentes responde 201 CREATED');
        const incidenteCreado = resCrear.data;
        assert(Boolean(incidenteCreado.id), 'Incidente creado tiene UUID');
        assert(incidenteCreado.ticket_folio.startsWith('TKT-'), `Folio generado correctamente: ${incidenteCreado.ticket_folio}`);
        assert(incidenteCreado.estado === 'REGISTRADO', 'Estado inicial es REGISTRADO');
        assert(incidenteCreado.confirmaciones_count === 1, 'Contador de confirmaciones inicializa en 1');
        assert(incidenteCreado.entidad_asignada_id === '11111111-1111-1111-1111-111111111111', 'Entidad asignada resuelta correctamente a MML');
        console.log(`✓ TEST 2 SUPERADO CON ÉXITO (ID: ${incidenteCreado.id}, Folio: ${incidenteCreado.ticket_folio})\n`);

        // -----------------------------------------------------------------
        // PRUEBA 3: Deduplicación y Confirmaciones
        // -----------------------------------------------------------------
        console.log('--- TEST 3: Confirmación y Reglas de Deduplicación ---');
        // 3.1 Creador intenta autoconfirmar -> Debe fallar 400
        const resAutoConf = await request('POST', `/api/incidentes/${incidenteCreado.id}/confirmar`, {}, tokenCiudadano1);
        assert(resAutoConf.status === 400, 'Creador NO puede autoconfirmar incidente (HTTP 400)');

        // 3.2 Ciudadano 2 confirma el incidente -> Debe ser exitoso 201 y confirmaciones_count subir a 2
        const resConf2 = await request('POST', `/api/incidentes/${incidenteCreado.id}/confirmar`, {
            foto_adicional_url: 'https://storage.viaalerta.pe/evidencia-conf-1.jpg'
        }, tokenCiudadano2);
        assert(resConf2.status === 201, 'Ciudadano 2 confirma incidente (HTTP 201)');
        assert(resConf2.data.confirmaciones_count === 2, 'Trigger trg_sync_confirmaciones incrementó confirmaciones_count a 2');

        // 3.3 Ciudadano 2 intenta confirmar nuevamente -> Debe fallar 409
        const resConfDup = await request('POST', `/api/incidentes/${incidenteCreado.id}/confirmar`, {}, tokenCiudadano2);
        assert(resConfDup.status === 409, 'Violación de unicidad uq_incidente_usuario prevenida (HTTP 409)');
        console.log('✓ TEST 3 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 4: Aislamiento Multiorganizacional por Rol
        // -----------------------------------------------------------------
        console.log('--- TEST 4: Aislamiento Multiorganizacional por Rol ---');
        // 4.1 Operador MML lista incidentes -> Debe ver el incidente creado
        const resListMML = await request('GET', '/api/incidentes', null, tokenOperadorMML);
        assert(resListMML.status === 200, 'Operador MML puede listar incidentes (HTTP 200)');
        const incMML = resListMML.data.find(i => i.id === incidenteCreado.id);
        assert(Boolean(incMML), 'Operador MML visualiza incidente asignado a su entidad');
        assert(resListMML.data.every(i => i.entidad_asignada_id === '11111111-1111-1111-1111-111111111111'), 'Todos los incidentes listados pertenecen a MML');

        // 4.2 Operador SEDAPAL lista incidentes -> NO debe ver el incidente de MML
        const resListSEDAPAL = await request('GET', '/api/incidentes', null, tokenOperadorSEDAPAL);
        assert(resListSEDAPAL.status === 200, 'Operador SEDAPAL puede consultar su bandeja (HTTP 200)');
        const incSedapal = resListSEDAPAL.data.find(i => i.id === incidenteCreado.id);
        assert(!incSedapal, 'Aislamiento estricto: Operador SEDAPAL NO visualiza incidente de MML');

        // 4.3 Operador SEDAPAL intenta obtener el detalle de MML -> 403 Forbidden
        const resDetalleSEDAPAL = await request('GET', `/api/incidentes/${incidenteCreado.id}`, null, tokenOperadorSEDAPAL);
        assert(resDetalleSEDAPAL.status === 403, 'Operador SEDAPAL bloqueado al consultar detalle de incidente de MML (HTTP 403)');

        // 4.4 Operador SEDAPAL intenta cambiar estado a incidente de MML -> 403 Forbidden
        const resPatchSEDAPAL = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'EVALUACION'
        }, tokenOperadorSEDAPAL);
        assert(resPatchSEDAPAL.status === 403, 'Operador SEDAPAL bloqueado al intentar modificar estado de MML (HTTP 403)');
        console.log('✓ TEST 4 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 5: Cambio de Estado y Trazabilidad en Historial
        // -----------------------------------------------------------------
        console.log('--- TEST 5: Cambio de Estado y Registro en Historial ---');
        // 5.1 Operador MML cambia estado a EVALUACION
        const resPatchMML = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'EVALUACION',
            notaObservacion: 'Inspección técnica programada para verificación de carpeta asfáltica'
        }, tokenOperadorMML);
        assert(resPatchMML.status === 200, 'Operador MML actualiza estado a EVALUACION (HTTP 200)');
        assert(resPatchMML.data.estado === 'EVALUACION', 'El nuevo estado del incidente es EVALUACION');
        assert(resPatchMML.data.historial.estado_anterior === 'REGISTRADO', 'Historial registra estado anterior REGISTRADO');
        assert(resPatchMML.data.historial.estado_nuevo === 'EVALUACION', 'Historial registra estado nuevo EVALUACION');

        // 5.2 Obtener detalle completo y verificar historial acumulativo
        const resDetalleFinal = await request('GET', `/api/incidentes/${incidenteCreado.id}`, null, tokenCiudadano1);
        assert(resDetalleFinal.status === 200, 'Detalle completo obtenido (HTTP 200)');
        assert(resDetalleFinal.data.historial.length === 2, 'Historial contiene exactamente 2 entradas auditables');
        assert(resDetalleFinal.data.confirmaciones.length === 1, 'Detalle contiene la confirmación de Ciudadano 2');
        assert(resDetalleFinal.data.confirmaciones_count === 2, 'Contador de confirmaciones se mantiene en 2');

        // 5.3 Probar validación de DESESTIMADO sin motivo (debe fallar 400)
        const resDesestimadoSinMotivo = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'DESESTIMADO'
        }, tokenOperadorMML);
        assert(resDesestimadoSinMotivo.status === 400, 'Rechazo al intentar DESESTIMAR sin motivo (HTTP 400)');

        // 5.4 Operador MML desestima con motivo válido
        const resDesestimado = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'DESESTIMADO',
            motivoDesestimacion: 'Zona en intervención por obra mayor autorizada.',
            notaObservacion: 'Constatado en plano de desvíos'
        }, tokenOperadorMML);
        assert(resDesestimado.status === 200, 'Incidente desestimado con motivo válido (HTTP 200)');
        assert(resDesestimado.data.estado === 'DESESTIMADO', 'Estado final es DESESTIMADO');
        assert(resDesestimado.data.motivo_desestimacion === 'Zona en intervención por obra mayor autorizada.', 'Motivo de desestimación persistido');

        // 5.5 Verificar historial final acumulativo
        const resHistorialFinal = await request('GET', `/api/incidentes/${incidenteCreado.id}`, null, tokenAdmin);
        assert(resHistorialFinal.data.historial.length === 3, 'Historial auditable cuenta con 3 transiciones registradas');
        console.log('✓ TEST 5 SUPERADO CON ÉXITO\n');

        // -----------------------------------------------------------------
        // PRUEBA 6: Controles RBAC Adicionales
        // -----------------------------------------------------------------
        console.log('--- TEST 6: Controles RBAC Adicionales ---');
        // 6.1 Operador MML NO puede reportar como ciudadano
        const resOperadorCrea = await request('POST', '/api/incidentes', nuevoIncidentePayload, tokenOperadorMML);
        assert(resOperadorCrea.status === 403, 'Operador de entidad no puede crear reporte ciudadano (HTTP 403)');

        // 6.2 Ciudadano NO puede cambiar estado de incidente
        const resCiudadanoCambia = await request('PATCH', `/api/incidentes/${incidenteCreado.id}/estado`, {
            nuevoEstado: 'REPARACION'
        }, tokenCiudadano1);
        assert(resCiudadanoCambia.status === 403, 'Ciudadano no puede cambiar estado de incidentes (HTTP 403)');
        console.log('✓ TEST 6 SUPERADO CON ÉXITO\n');

        console.log('====================================================');
        console.log('   TODAS LAS PRUEBAS DE LA FASE 3 PASARON (100%)    ');
        console.log('====================================================');

    } finally {
        if (server) {
            server.close();
        }
        await pool.end();
    }
};

ejecutarPruebas().catch((err) => {
    console.error('ERROR EN SMOKE TEST:', err);
    process.exit(1);
});
