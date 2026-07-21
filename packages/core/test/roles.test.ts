import { describe, it, expect } from "vitest";
import {
  APP_ROLES,
  ROLE_ORDER,
  uiRoleToDbRole,
  dbRoleToUiLabel,
} from "../src/auth/index";

describe("papéis (roles)", () => {
  it("APP_ROLES bate com o enum app_role do banco (admin, operator, viewer)", () => {
    expect(APP_ROLES).toEqual(["admin", "operator", "viewer"]);
  });

  it("ROLE_ORDER é hierárquico do menor para o maior papel", () => {
    expect(ROLE_ORDER).toEqual(["viewer", "operator", "admin"]);
  });

  describe("uiRoleToDbRole", () => {
    it("member vira viewer", () => {
      expect(uiRoleToDbRole("member")).toBe("viewer");
    });

    it("operator vira operator", () => {
      expect(uiRoleToDbRole("operator")).toBe("operator");
    });

    it("admin vira admin", () => {
      expect(uiRoleToDbRole("admin")).toBe("admin");
    });
  });

  describe("dbRoleToUiLabel", () => {
    it("viewer é exibido como Member", () => {
      expect(dbRoleToUiLabel("viewer")).toBe("Member");
    });

    it("operator é exibido como Operator", () => {
      expect(dbRoleToUiLabel("operator")).toBe("Operator");
    });

    it("admin é exibido como Admin", () => {
      expect(dbRoleToUiLabel("admin")).toBe("Admin");
    });
  });
});
