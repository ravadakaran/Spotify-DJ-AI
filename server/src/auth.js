import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { HttpError, parse, schemas } from "./validation.js";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export const publicUser = (user) => ({
  id: user._id,
  displayName: user.displayName,
  isAdmin: user.isAdmin,
});
export function createAuth(models, config, onRevoke = () => {}) {
  const { User, Session } = models;
  const cookieOptions = {
    httpOnly: true,
    secure: config.secure,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 86400000,
  };
  const issue = (user, session) =>
    jwt.sign({ sid: session._id }, config.key, {
      algorithm: "HS256",
      subject: user._id,
      expiresIn: "15m",
      issuer: config.issuer,
      audience: config.audience,
    });
  const fresh = () => randomBytes(48).toString("base64url");
  async function revoke(id) {
    await Session.updateOne({ _id: id }, { $set: { revokedAt: new Date() } });
    onRevoke(id);
  }
  async function verify(token) {
    try {
      const claims = jwt.verify(token, config.key, {
        algorithms: ["HS256"],
        issuer: config.issuer,
        audience: config.audience,
      });
      const session = await Session.findOne({
        _id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      const user = session && (await User.findById(claims.sub));
      if (!user) throw new Error("Invalid session");
      return { user, claims };
    } catch {
      throw new HttpError(401, "UNAUTHORIZED", "Please sign in again.");
    }
  }
  const middleware = async (req, _res, next) => {
    try {
      req.auth = await verify(
        req.headers.authorization?.replace(/^Bearer /, ""),
      );
      next();
    } catch (error) {
      next(error);
    }
  };
  const admin = (req, _res, next) =>
    req.auth.user.isAdmin
      ? next()
      : next(new HttpError(403, "FORBIDDEN", "Administrator access required."));
  const origin = (req, _res, next) =>
    req.headers.origin === config.origin &&
    req.headers["x-csrf-protection"] === "1"
      ? next()
      : next(
          new HttpError(
            403,
            "ORIGIN_REJECTED",
            "Same-origin request required.",
          ),
        );
  return {
    verify,
    middleware,
    admin,
    origin,
    register: async (req, res) => {
      const body = parse(schemas.register, req.body);
      const user = await User.create({
        emailNormalized: body.email.trim().toLowerCase(),
        displayName: body.displayName,
        passwordHash: await argon2.hash(body.password, passwordOptions),
      });
      res.status(201).json({ user: publicUser(user) });
    },
    login: async (req, res) => {
      const body = parse(schemas.login, req.body);
      const user = await User.findOne({
        emailNormalized: body.email.trim().toLowerCase(),
      }).select("+passwordHash");
      if (!user || !(await argon2.verify(user.passwordHash, body.password)))
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect.",
        );
      const token = fresh();
      const session = await Session.create({
        userId: user._id,
        tokenHash: hash(token),
        consumedHashes: [],
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      res
        .cookie("refresh", token, cookieOptions)
        .json({
          user: publicUser(user),
          accessToken: issue(user, session),
          expiresIn: 900,
        });
    },
    refresh: async (req, res) => {
      const value = req.cookies.refresh;
      if (!value)
        throw new HttpError(401, "UNAUTHORIZED", "Please sign in again.");
      const oldHash = hash(value);
      const nextToken = fresh();
      const session = await Session.findOneAndUpdate(
        {
          tokenHash: oldHash,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
          "consumedHashes.999": { $exists: false },
        },
        {
          $set: { tokenHash: hash(nextToken) },
          $push: { consumedHashes: oldHash },
        },
        { new: true },
      );
      if (!session) {
        const replay = await Session.findOne({
          $or: [{ consumedHashes: oldHash }, { tokenHash: oldHash }],
        });
        if (replay) await revoke(replay._id);
        res.clearCookie("refresh", { ...cookieOptions, maxAge: undefined });
        throw new HttpError(401, "REFRESH_REJECTED", "Please sign in again.");
      }
      const user = await User.findById(session.userId);
      if (!user) {
        await revoke(session._id);
        throw new HttpError(401, "UNAUTHORIZED", "Please sign in again.");
      }
      res
        .cookie("refresh", nextToken, {
          ...cookieOptions,
          maxAge: session.expiresAt.getTime() - Date.now(),
        })
        .json({
          accessToken: issue(user, session),
          expiresIn: 900,
          user: publicUser(user),
        });
    },
    logout: async (req, res) => {
      if (req.cookies.refresh) {
        const digest = hash(req.cookies.refresh);
        const session = await Session.findOne({
          $or: [{ tokenHash: digest }, { consumedHashes: digest }],
        });
        if (session) await revoke(session._id);
      }
      res
        .clearCookie("refresh", { ...cookieOptions, maxAge: undefined })
        .status(204)
        .end();
    },
  };
}
