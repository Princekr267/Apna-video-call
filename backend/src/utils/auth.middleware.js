import jwt from "jsonwebtoken";
import httpStatus from "http-status";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(httpStatus.UNAUTHORIZED).json({ message: "Access token required" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, username }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Token expired", expired: true });
        }
        return res.status(httpStatus.FORBIDDEN).json({ message: "Invalid token" });
    }
};

export const generateAccessToken = (userId, username) => {
    return jwt.sign(
        { userId, username },
        JWT_SECRET,
        { expiresIn: '7d' } // 7 days expiration
    );
};

export const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: '30d' } // 30 days expiration
    );
};
