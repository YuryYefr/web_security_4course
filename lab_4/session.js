import fs from "fs";
import {v4 as uuid} from "uuid";

export class Session {
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
        const sessionId = uuid;
        this.set(sessionId);
        return sessionId;
    }

    destroy(req) {
        const sessionId = req.sessionId;
        delete this.#sessions[sessionId];
        this.#storeSessions();
    }
}