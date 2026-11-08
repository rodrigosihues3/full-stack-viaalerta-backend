import jwt from 'jsonwebtoken';

export const firmarToken = (payload, duracion) => {
    return jwt.sign(payload, process.env.JWT_SECRETO, { expiresIn: duracion });
};

export const verificarToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRETO);
};

