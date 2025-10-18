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
