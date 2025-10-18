import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import {v4 as uuid} from "uuid";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import onFinished from "on-finished";
import {fileURLToPath} from "url";
import jwt from "jsonwebtoken";
import {loginWithPassword, envs} from "./helpers.js";

dotenv.config({path: "../.env"});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;
const SESSION_KEY = "Authorization";

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "public")));

// ---- Session handling ----
class Session {
    #sessions = {};

    constructor() {
        try {
            const data = fs.readFileSync("./sessions.json", "utf8");
            this.#sessions = JSON.parse(data.trim());
        } catch {
            this.#sessions = {};
        }
    }

    #storeSessions() {
        fs.writeFileSync("./sessions.json", JSON.stringify(this.#sessions, null, 2), "utf-8");
    }

    set(key, value = {}) {
        this.#sessions[key] = value;
        this.#storeSessions();
    }

    get(key) {
        return this.#sessions[key];
    }

    init() {
        const sessionId = uuid();
        this.set(sessionId);
        return sessionId;
    }

    destroy(req) {
        const sessionId = req.sessionId;
        delete this.#sessions[sessionId];
        this.#storeSessions();
    }
}

const sessions = new Session();

// ---- Middleware to attach or create session ----
app.use((req, res, next) => {
    const token = req.get(SESSION_KEY);
    if (token && sessions.get(token)) {
        req.session = sessions.get(token);
        req.sessionId = token;
    } else {
        req.session = {};
        req.sessionId = sessions.init();
    }

    onFinished(req, () => {
        sessions.set(req.sessionId, req.session);
    });

    next();
});

// ---- Auth0 Helpers ----
async function getManagementToken() {
    const url = `https://${envs.DOMAIN}/oauth/token`;
    const payload = {
        client_id: envs.CLIENT_ID,
        client_secret: envs.CLIENT_SECRET,
        audience: envs.AUDIENCE,
        grant_type: "client_credentials",
    };
    const res = await axios.post(url, payload, {headers: {"Content-Type": "application/json"}});
    return res.data;
}

async function getRefreshToken(code) {
    const url = `https://${envs.DOMAIN}/oauth/token`;
    const payload = {
        grant_type: "authorization_code",
        client_id: envs.CLIENT_ID,
        client_secret: envs.CLIENT_SECRET,
        redirect_uri: "http://127.0.0.1:3000/callback",
        code,
    };
    const res = await axios.post(url, payload);
    return res.data;
}

// ---- Routes ----
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/logout", (req, res) => {
    sessions.destroy(req);
    res.redirect("/");
});

// Local users for demo
const users = [
    {login: "Login", password: "Password", username: "Username"},
    {login: "Login1", password: "Password1", username: "Username1"},
    {login: envs.EMAIL, password: envs.PASSWORD, username: "Username1"},
];

app.post("/api/login", (req, res) => {
    const {login, password} = req.body;
    const user = users.find((u) => u.login === login && u.password === password);
    if (user) {
        req.session.username = user.username;
        req.session.login = user.login;
        return res.json({username: user.username, token: req.sessionId});
    }
    res.status(401).send();
});

// Auth0 login redirect
app.get("/auth", (req, res) => {
    const authUrl = `https://${envs.DOMAIN}/authorize?response_type=code&client_id=${envs.CLIENT_ID}&redirect_uri=http://127.0.0.1:3000/callback&scope=offline_access%20openid%20profile%20email&state=xyz123&audience=${envs.AUDIENCE}`;
    res.redirect(authUrl);
});

// Auth0 callback
app.get("/callback", async (req, res) => {
    const {code} = req.query;
    if (!code) return res.status(400).send("Missing code");

    try {
        const tokenData = await getRefreshToken(code);
        req.session.tokens = tokenData;

        const decoded = jwt.decode(tokenData.id_token);
        req.session.username = decoded.name || decoded.email || "Auth0User";
        req.session.email = decoded.email;
        req.session.sub = decoded.sub;

        // Redirect to home with session token
        res.redirect(`/?token=${req.sessionId}`);
    } catch (err) {
        console.error("Auth0 callback error:", err.response?.data || err.message);
        res.status(500).send("Token exchange failed");
    }
});

// API endpoint to get current session user
app.get("/api/me", (req, res) => {
    if (req.session?.username) return res.json({username: req.session.username, email: req.session.email});
    res.status(401).send();
});

// Management API token
app.get("/token", async (req, res) => {
    try {
        const tokenData = await getManagementToken();
        req.session.mgmt_token = tokenData.access_token;
        res.json(tokenData);
    } catch (err) {
        res.status(500).send("Could not retrieve management token");
    }
});

// Create user
app.get("/create-user", async (req, res) => {
    if (!req.session.mgmt_token) return res.status(401).send("Visit /token first.");
    const url = `https://${envs.DOMAIN}/api/v2/users`;
    const payload = {email: envs.EMAIL, password: envs.PASSWORD, connection: "my-database", email_verified: false};
    try {
        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${req.session.mgmt_token}`,
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json(err.response?.data);
    }
});

// Call Flask API
app.get("/call-api", async (req, res) => {
    const tokens = req.session.tokens;
    if (!tokens?.access_token) {
        return res.status(401).send("No access token found. Login with Auth0 first.");
    }

    try {
        const apiResponse = await axios.get("http://127.0.0.1:8080/api/private", {
            headers: {Authorization: `Bearer ${tokens.access_token}`},
        });
        res.json(apiResponse.data);
    } catch (err) {
        console.error("Error calling Flask API:", err.response?.data || err.message);
        res.status(500).send("Error calling Flask API");
    }
});


// Password grant login
app.get("/passwordLogin", async (req, res) => {
    try {
        const passwordLogin = await loginWithPassword(envs.EMAIL, envs.PASSWORD);
        req.session.username = passwordLogin.username || envs.EMAIL;
        req.session.tokens = passwordLogin;
        res.json({username: req.session.username, token: req.sessionId});
    } catch (err) {
        res.status(401).send("Password grant login failed");
    }
});

// Start server
app.listen(port, () => {
    console.log(`🚀 App running on http://127.0.0.1:${port}`);
});
