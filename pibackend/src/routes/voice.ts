import { Elysia } from "elysia";

export const voiceRoutes = new Elysia({ prefix: "/api/voice" })
  .get("/config", () => ({ enabled: Boolean(process.env.GRADIUM_API_KEY) }))
  .post("/stt", ({ set }) => {
    set.status = 503;
    return { detail: "Gradium STT is not implemented in pibackend yet." };
  })
  .post("/tts", ({ set }) => {
    set.status = 503;
    return { detail: "Gradium TTS is not implemented in pibackend yet." };
  });
