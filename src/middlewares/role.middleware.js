export const exigirRol = (...rolesPermitidos) => {
    const permitidos = rolesPermitidos.flat();
    return (req, res, next) => {
        if (!req.usuario || !permitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ error: 'Acceso no autorizado para este perfil' });
        }
        next();
    };
};

export const roleMiddleware = exigirRol;
export const permitirRoles = exigirRol;


