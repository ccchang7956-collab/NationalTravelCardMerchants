import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import FilterSheet, { DEFAULT_FILTER_STATE } from "@/components/FilterSheet";
import { clampRadiusKm, mapSearchParams, mapSearchKey } from "@/utils/mapSearchParams";
import { loadHomeData } from "@/utils/homeData";

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
});

test("official industry groups and details are applied to merchant filters", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{
      industry_code: "790011",
      industry_name: "旅行業",
      industry_group_code: "79",
      industry_group_name: "旅行及其他相關服務業",
      industry_group_order: 65,
    }],
  });
  const submit = jest.fn(event => event.preventDefault());
  const change = jest.fn();
  render(<form onSubmit={submit}>
    <FilterSheet filters={DEFAULT_FILTER_STATE} cities={["台北市"]} onChange={change}
      userLocation={{ lat: 25, lon: 121 }} onRequestLocation={jest.fn()} locationLoading={false} locationError={null} />
    <button type="submit">搜尋表單</button>
  </form>);
  fireEvent.click(screen.getByRole("button", { name: "篩選" }));
  await screen.findByRole("option", { name: "旅行及其他相關服務業" });
  const group = screen.getByLabelText("行業別");
  const detail = screen.getByLabelText("行業細項分類");
  expect(detail).toBeDisabled();
  fireEvent.change(group, { target: { value: "79" } });
  expect(detail).toBeEnabled();
  expect(screen.getByRole("option", { name: "旅行業" })).toBeInTheDocument();
  fireEvent.change(detail, { target: { value: "790011" } });
  fireEvent.click(screen.getByRole("button", { name: "有" }));
  fireEvent.click(screen.getByRole("button", { name: "20 km" }));
  fireEvent.click(screen.getByRole("button", { name: /套用篩選/ }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ hasWebsite: true, radiusKm: 20, industryCode: "790011" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "搜尋表單" }));
  expect(submit).toHaveBeenCalledTimes(1);
});

test("map sheet always has a radius and reset restores 2 km", async () => {
  const change = jest.fn();
  render(<FilterSheet mode="map" filters={{ ...DEFAULT_FILTER_STATE, radiusKm: 20 }} cities={[]}
    onChange={change} userLocation={null} onRequestLocation={jest.fn()} locationLoading={false} locationError={null} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /篩選/ })); });
  // Only the website selector has an unlimited choice.
  expect(screen.getAllByRole("button", { name: "不限" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "清除全部" }));
  fireEvent.click(screen.getByRole("button", { name: /套用篩選/ }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 2 }));
});

test("list distance choices stay disabled until the explicit location request succeeds", async () => {
  const requestLocation = jest.fn();
  const change = jest.fn();
  const props = { filters: DEFAULT_FILTER_STATE, cities: [], onChange: change,
    onRequestLocation: requestLocation, locationLoading: false, locationError: null };
  const { rerender } = render(<FilterSheet {...props} userLocation={null} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "篩選" })); });
  expect(screen.getByRole("button", { name: "20 km" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "取得位置" }));
  expect(requestLocation).toHaveBeenCalledTimes(1);
  rerender(<FilterSheet {...props} userLocation={{ lat: 25, lon: 121 }} />);
  expect(screen.getByRole("button", { name: "20 km" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "20 km" }));
  fireEvent.click(screen.getByRole("button", { name: /套用篩選/ }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 20 }));
});

test("map URLs and request keys preserve all filters and a 20 km radius", () => {
  const params = mapSearchParams(25, 121, 20, "咖啡", "561", "台北市", false);
  expect(params.get("radius")).toBe("20");
  expect(params.get("city")).toBe("台北市");
  expect(params.get("has_website")).toBe("false");
  expect(mapSearchKey(25, 121, 20, "咖啡", "561", "台北市", false)).not.toBe(mapSearchKey(25, 121, 20, "咖啡", "561", "台北市", true));
  expect(clampRadiusKm(20)).toBe(20);
});

test("statistics failure retains successful merchant results", async () => {
  const page = { total: 1, total_pages: 1, items: [{ id: 1, name: "商店" }] };
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => page }).mockRejectedValueOnce(new Error("offline"));
  expect(await loadHomeData("http://test", new URLSearchParams())).toEqual({ data: page, stats: null });
});

test("API failure is distinct from a successful empty result", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  expect((await loadHomeData("http://test", new URLSearchParams())).data).toBeNull();
  const empty = { total: 0, total_pages: 1, items: [] };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => empty });
  expect((await loadHomeData("http://test", new URLSearchParams())).data).toEqual(empty);
});
