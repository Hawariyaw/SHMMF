import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret_change_me";
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}
export function requireAuth(req, res, next) {
    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const token = authHeader.slice("Bearer ".length);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    }
    catch {
        res.status(401).json({ message: "Invalid token" });
    }
}
export function requireRoles(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        next();
    };
}
