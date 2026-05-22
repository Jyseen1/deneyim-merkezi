import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db/client";
import { verifyJWT } from "../middleware/auth";

// Telefon URL-safe degil; encode'lanmis sekilde gelir, Fastify auto-decode eder.
const visitorsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { phone: string } }>(
    "/:phone",
    { preHandler: verifyJWT },
    async (req, reply) => {
      const phone = decodeURIComponent(req.params.phone);
      const visitor = await prisma.visitor.findUnique({
        where: { phone },
        include: {
          reservations: {
            orderBy: { visitDate: "desc" },
          },
        },
      });
      if (!visitor) {
        return reply.code(404).send({ error: "not_found" });
      }

      const items = visitor.reservations;
      const stats = {
        total: items.length,
        approved: items.filter((r) => r.status === "APPROVED").length,
        cancelled: items.filter((r) => r.status === "CANCELLED").length,
        rejected: items.filter((r) => r.status === "REJECTED").length,
        noShow: items.filter((r) => r.status === "NO_SHOW").length,
        completed: items.filter((r) => r.status === "COMPLETED").length,
        firstVisit:
          items.length > 0
            ? items[items.length - 1].visitDate
            : null,
        lastVisit: items.length > 0 ? items[0].visitDate : null,
      };

      return reply.send({
        visitor: {
          id: visitor.id,
          name: visitor.name,
          phone: visitor.phone,
          email: visitor.email,
          createdAt: visitor.createdAt,
        },
        reservations: items,
        stats,
      });
    },
  );
};

export default visitorsRoutes;
