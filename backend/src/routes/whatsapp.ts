import type { FastifyPluginAsync } from "fastify";
import { sendTestMessage } from "../services/whatsapp.service";
import { verifyJWT } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";

const whatsappRoutes: FastifyPluginAsync = async (app) => {
  // STAFF_WA_PHONE'a test mesaji gonderir. Sadece admin.
  app.post(
    "/test",
    { preHandler: [verifyJWT, requireAdmin] },
    async (_req, reply) => {
      const staff = process.env.STAFF_WA_PHONE;
      if (!staff || staff.includes("X")) {
        return reply.send({
          ok: false,
          message: "STAFF_WA_PHONE yapılandırılmamış",
        });
      }
      const result = await sendTestMessage(staff);
      if (!result.ok) {
        return reply.send({
          ok: false,
          message: result.reason ?? "Test mesajı gönderilemedi",
        });
      }
      return reply.send({
        ok: true,
        message: `Test mesajı gönderildi (${result.waMessageId})`,
      });
    },
  );
};

export default whatsappRoutes;
