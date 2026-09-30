import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { fetchWithAuth } from "@/utils/api";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import HomeSearchSection from "@/components/HomeSearchSection";
import type { FilterState } from "@/components/FilterSheet";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <form action="/">{children}</form>
  ),
}));

describe("fetchWithAuth 401 handling", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("dispatches 'ntc:unauthorized' and clears token on 401", async () => {
    localStorage.setItem("ntc_token", "expired-token");
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ status: 401, ok: false })
    ) as jest.Mock;

    const handler = jest.fn();
    window.addEventListener("ntc:unauthorized", handler);
    await fetchWithAuth("/api/auth/me");
    window.removeEventListener("ntc:unauthorized", handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("ntc_token")).toBeNull();
  });

  it("does not dispatch 'ntc:unauthorized' on 200", async () => {
    localStorage.setItem("ntc_token", "valid-token");
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      })
    ) as jest.Mock;

    const handler = jest.fn();
    window.addEventListener("ntc:unauthorized", handler);
    await fetchWithAuth("/api/auth/me");
    window.removeEventListener("ntc:unauthorized", handler);

    expect(handler).not.toHaveBeenCalled();
    expect(localStorage.getItem("ntc_token")).toBe("valid-token");
  });
});

describe("merchant id encoding", () => {
  it("encodes '/' so it does not break the route path", () => {
    expect(encodeURIComponent("123/456")).toBe("123%2F456");
    expect(encodeURIComponent("A B/C")).not.toContain("/");
  });
});

describe("HomeSearchSection lat/lon persistence", () => {
  it("renders hidden lat/lon inputs from initialLat/initialLon", () => {
    const filters: FilterState = {
      city: "",
      hasWebsite: null,
      radiusKm: 2,
      industryCode: "",
    };
    const { container } = render(
      <HomeSearchSection
        initialQ=""
        initialFilters={filters}
        cities={["台北市"]}
        initialLat={25.0339}
        initialLon={121.5645}
      />
    );

    const lat = container.querySelector(
      'input[type="hidden"][name="lat"]'
    ) as HTMLInputElement | null;
    const lon = container.querySelector(
      'input[type="hidden"][name="lon"]'
    ) as HTMLInputElement | null;

    expect(lat).not.toBeNull();
    expect(lon).not.toBeNull();
    expect(lat?.value).toBe("25.0339");
    expect(lon?.value).toBe("121.5645");
  });
});

describe("AuthContext ntc:unauthorized handling", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    ) as jest.Mock;
  });

  it("logs out when 'ntc:unauthorized' is dispatched", async () => {
    function Probe() {
      const { user, login } = useAuth();
      return (
        <>
          <span data-testid="auth-user">{user ? user.name : "anonymous"}</span>
          <button
            type="button"
            onClick={() =>
              login("tok123", { id: 1, email: "a@example.com", name: "Tester" })
            }
          >
            sign-in
          </button>
        </>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "sign-in" }));
    await waitFor(() =>
      expect(screen.getByTestId("auth-user")).toHaveTextContent("Tester")
    );

    act(() => {
      window.dispatchEvent(new Event("ntc:unauthorized"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-user")).toHaveTextContent("anonymous")
    );
    expect(localStorage.getItem("ntc_token")).toBeNull();
  });
});
