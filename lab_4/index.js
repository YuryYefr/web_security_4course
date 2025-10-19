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
import {loginWithPassword, envs, getManagementToken, getRefreshToken} from "./helpers.js";

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



// ---- Routes ----
app.get("/", (req, res) => {
    // Redirect user to Auth0's Universal Login
    const authUrl = `https://${envs.DOMAIN}/authorize` +
        `?response_type=code` +
        `&client_id=${envs.CLIENT_ID}` +
        `&redirect_uri=${envs.API_BACKEND_DOMAIN}/callback` +   // <--- callback goes to your API domain
        `&scope=openid%20profile%20email%20offline_access` +
        `&audience=${envs.AUDIENCE}` +
        `&state=${uuid()}`;
    console.log(authUrl);

    res.redirect(authUrl);
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
    const { code, state, error } = req.query;

    if (error) {
        console.error("Auth error:", error);
        return res.status(400).send(`Authentication failed: ${error}`);
    }

    if (!code) return res.status(400).send("Missing authorization code");

    try {
        // Exchange the code for tokens (Authorization Code Grant)
        const tokenResponse = await axios.post(
            `https://${envs.DOMAIN}/oauth/token`,
            {
                grant_type: "authorization_code",
                client_id: envs.CLIENT_ID,
                client_secret: envs.CLIENT_SECRET,
                code,
                redirect_uri: `${envs.FRONTEND_DOMAIN}/callback`,
            },
            { headers: { "Content-Type": "application/json" } }
        );

        const tokenData = tokenResponse.data;
        const decoded = jwt.decode(tokenData.id_token);

        req.session.tokens = tokenData;
        req.session.username = decoded?.name || decoded?.email || "SSOUser";
        req.session.email = decoded?.email;
        req.session.sub = decoded?.sub;

        // Redirect user back to frontend app with the session token
        const redirectUrl = `${envs.FRONTEND_DOMAIN}/?token=${req.sessionId}`;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error("Error exchanging code for tokens:", err.response?.data || err.message);
        res.status(500).send("Failed to exchange authorization code");
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
