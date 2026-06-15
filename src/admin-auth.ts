import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_TOKEN_PLACEHOLDER = "change-me-to-a-random-32-byte-token";

export function hasAdminAccess(input: {
    token?: string | string[];
    expectedToken?: string;
}): boolean {
    if (
        !input.expectedToken ||
        input.expectedToken === ADMIN_TOKEN_PLACEHOLDER ||
        !input.token ||
        Array.isArray(input.token)
    ) {
        return false;
    }

    const token = Buffer.from(input.token);
    const expectedToken = Buffer.from(input.expectedToken);
    if (token.length !== expectedToken.length) {
        return false;
    }
    return timingSafeEqual(token, expectedToken);
}

export function requireAdminAccess(expectedToken?: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const allowed = hasAdminAccess({
            token: req.header("X-Admin-Token"),
            expectedToken,
        });
        if (!allowed) {
            res.status(401).send({ status: "fail", message: "unauthorized" });
            return;
        }
        next();
    };
}
