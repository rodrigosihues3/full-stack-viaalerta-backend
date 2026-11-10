-- =============================================================================
-- MIGRACIÓN 001: SISTEMA DE NOTIFICACIONES CIUDADANAS Y MONITOR VIAL GEORREFERENCIADO
-- Proyecto: VíaAlerta (Supabase / PostgreSQL)
-- Fecha: 2026-11-09
-- Descripción:
--   1. Asegura la existencia de la tabla `public.notificaciones_usuario` y agrega
--      de forma no destructiva la columna opcional `incidente_id` para vincular
--      directamente cada notificación con el reporte que la originó.
--   2. Crea índices de rendimiento para consultas de notificaciones por ciudadano
--      y búsquedas geoespaciales del Monitor Vial.
--   3. Configura políticas de seguridad Row Level Security (RLS) para garantizar
--      que cada ciudadano consulte únicamente sus propias notificaciones.
--   4. Habilita la publicación en Supabase Realtime.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PASO 1: Tabla de Notificaciones de Usuario (Idempotente / No destructivo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificaciones_usuario (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    titulo character varying(120) NOT NULL,
    mensaje text NOT NULL,
    tipo character varying(50) DEFAULT 'ADVERTENCIA'::character varying,
    leido boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

-- Agregar columna opcional `incidente_id` si aún no existe en la tabla
ALTER TABLE public.notificaciones_usuario
    ADD COLUMN IF NOT EXISTS incidente_id uuid REFERENCES public.incidentes(id) ON DELETE CASCADE;

COMMENT ON TABLE public.notificaciones_usuario IS 'Almacena las notificaciones persistentes enviadas a los ciudadanos sobre el estado de sus reportes viales.';
COMMENT ON COLUMN public.notificaciones_usuario.incidente_id IS 'Referencia opcional al incidente vial que originó la notificación.';

-- -----------------------------------------------------------------------------
-- PASO 2: Índices para Optimización de Consultas
-- -----------------------------------------------------------------------------
-- Índice compuesto para listar rápidamente las notificaciones de un ciudadano y contar las no leídas
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leido_fecha
    ON public.notificaciones_usuario USING btree (usuario_id, leido, creado_en DESC);

-- Índice por incidente relacionado
CREATE INDEX IF NOT EXISTS idx_notificaciones_incidente_id
    ON public.notificaciones_usuario USING btree (incidente_id);

-- Índice compuesto para búsquedas por coordenadas en el Monitor Vial
CREATE INDEX IF NOT EXISTS idx_incidentes_coordenadas
    ON public.incidentes USING btree (latitud, longitud);

-- -----------------------------------------------------------------------------
-- PASO 3: Permisos y Políticas Row Level Security (RLS)
-- -----------------------------------------------------------------------------
GRANT ALL ON TABLE public.notificaciones_usuario TO postgres;
GRANT SELECT, UPDATE ON TABLE public.notificaciones_usuario TO authenticated;
GRANT ALL ON TABLE public.notificaciones_usuario TO service_role;

-- Nota: Se definen las políticas RLS para el acceso directo mediante PostgREST / Supabase Client
-- mientras el motor backend (Node.js pg.Pool) aplica aislamiento por JWT en la capa de servicios.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'notificaciones_usuario'
          AND policyname = 'ciudadano_lee_sus_notificaciones'
    ) THEN
        CREATE POLICY ciudadano_lee_sus_notificaciones
            ON public.notificaciones_usuario
            FOR SELECT
            USING (auth.uid() = usuario_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'notificaciones_usuario'
          AND policyname = 'ciudadano_actualiza_sus_notificaciones'
    ) THEN
        CREATE POLICY ciudadano_actualiza_sus_notificaciones
            ON public.notificaciones_usuario
            FOR UPDATE
            USING (auth.uid() = usuario_id)
            WITH CHECK (auth.uid() = usuario_id);
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- PASO 4: Publicación en Supabase Realtime
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'notificaciones_usuario'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones_usuario;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'incidentes'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.incidentes;
        END IF;
    END IF;
END
$$;

COMMIT;
