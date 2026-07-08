import { describe, it, expect } from "vitest";
import { shouldRedirectToChangePassword } from "../src/auth/index";

describe("shouldRedirectToChangePassword", () => {
  it("não redireciona visitante não autenticado", () => {
    expect(
      shouldRedirectToChangePassword({
        authenticated: false,
        mustChangePassword: true,
        path: "/traces",
      }),
    ).toBeNull();
  });

  it("redireciona autenticado com must_change_password para /change-password", () => {
    expect(
      shouldRedirectToChangePassword({
        authenticated: true,
        mustChangePassword: true,
        path: "/traces",
      }),
    ).toBe("/change-password");
  });

  it("não redireciona quando já está em /change-password (anti-loop)", () => {
    expect(
      shouldRedirectToChangePassword({
        authenticated: true,
        mustChangePassword: true,
        path: "/change-password",
      }),
    ).toBeNull();
  });

  it("não redireciona quando está em /login (permite logout/relogin)", () => {
    expect(
      shouldRedirectToChangePassword({
        authenticated: true,
        mustChangePassword: true,
        path: "/login",
      }),
    ).toBeNull();
  });

  it("não redireciona quando must_change_password é false", () => {
    expect(
      shouldRedirectToChangePassword({
        authenticated: true,
        mustChangePassword: false,
        path: "/traces",
      }),
    ).toBeNull();
  });
});
