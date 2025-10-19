import axios from "axios";
import dotenv from "dotenv";

dotenv.config({path: "../.env"});

export const envs = {
    DOMAIN: process.env.DOMAIN,
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    AUDIENCE: process.env.AUDIENCE,
    EMAIL: process.env.EMAIL,
    PASSWORD: process.env.PASSWORD,
    API_BACKEND_DOMAIN: process.env.API_BACKEND_DOMAIN,
    FRONTEND_DOMAIN: process.env.FRONTEND_DOMAIN,
};

export async function loginWithPassword(email, password) {
    const url = `https://${envs.DOMAIN}/oauth/token`;
    const payload = new URLSearchParams({
        grant_type: "password",
        username: email,
        password,
        client_id: envs.CLIENT_ID,
        client_secret: envs.CLIENT_SECRET,
        scope: "openid profile email offline_access",
    });
    const res = await axios.post(url, payload.toString(), {headers: {"Content-Type": "application/x-www-form-urlencoded"}});
    return res.data;
}
// ---- Auth0 Helpers ----
export async function getManagementToken() {
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

export async function getRefreshToken(code) {
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