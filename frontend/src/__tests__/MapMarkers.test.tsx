import { act, render, waitFor } from "@testing-library/react";
import MapView from "@/components/MapView";
import type { MapMerchant } from "@/utils/mapMerchants";

jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("leaflet.markercluster", () => ({}));
jest.mock("leaflet", () => ({ __esModule: true, default: {
  Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } },
  map: () => mockMap,
  tileLayer: () => ({ addTo: jest.fn() }),
  divIcon: jest.fn(),
  marker: () => mockCreateMarker(),
  markerClusterGroup: () => mockCluster,
  circle: () => ({ addTo: jest.fn().mockReturnThis(), setLatLng: jest.fn(), setRadius: jest.fn(), setStyle: jest.fn(), getBounds: jest.fn() }),
} }));

const mockRouter = { push: jest.fn() };
const mockMap = { addLayer: jest.fn(), removeLayer: jest.fn(), on: jest.fn(), remove: jest.fn(), fitBounds: jest.fn(), flyTo: jest.fn(), getZoom: () => 14 };
const mockCluster = { addLayers: jest.fn(), removeLayers: jest.fn(), removeLayer: jest.fn(), zoomToShowLayer: jest.fn((marker, callback) => callback()) };
const mockCreateMarker = jest.fn(() => ({
  bindPopup: jest.fn().mockReturnThis(), addTo: jest.fn().mockReturnThis(), on: jest.fn().mockReturnThis(),
  setLatLng: jest.fn(), setPopupContent: jest.fn(), openPopup: jest.fn(),
}));
const merchant = (id: number): MapMerchant => ({ id, name: `商店 ${id}`, address: "台北市", zip_code: null, tax_id: null, website: null, lat: 25, lon: 121 });
const base = { center: [25, 121] as [number, number], userLocation: null, onMapClick: jest.fn(), radius: 2, tempRadius: 2 };
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  jest.clearAllMocks();
  frames = new Map();
  let id = 0;
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++id, callback); return id; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => { frames.delete(frame); });
});
afterEach(() => jest.restoreAllMocks());

test("appending keeps existing markers; edits update their popup and cluster position, with fresh callbacks", async () => {
  const first = merchant(1);
  const select = jest.fn();
  const { rerender } = render(<MapView {...base} merchants={[first]} onSelectMerchant={select} />);
  await waitFor(() => expect(mockCluster.addLayers).toHaveBeenCalledTimes(1));
  const marker = mockCluster.addLayers.mock.calls[0][0][0];
  const click = marker.on.mock.calls.find(([event]: [string]) => event === "click")[1];
  const second = merchant(2);
  rerender(<MapView {...base} merchants={[first, second]} onSelectMerchant={select} />);
  expect(mockCluster.addLayers.mock.calls[1][0]).toHaveLength(1);
  expect(mockCluster.removeLayers).not.toHaveBeenCalled();
  expect(marker.setPopupContent).not.toHaveBeenCalled();
  const changed = { ...first, name: "更新商店", lat: 26, distance_km: 2 };
  const latestSelect = jest.fn();
  rerender(<MapView {...base} merchants={[changed, second]} onSelectMerchant={latestSelect} />);
  expect(mockCluster.removeLayer).toHaveBeenCalledWith(marker);
  expect(marker.setLatLng).toHaveBeenCalledWith([26, 121]);
  expect(marker.setPopupContent).toHaveBeenCalledWith(expect.stringContaining("更新商店"));
  act(() => click());
  expect(latestSelect).toHaveBeenCalledWith(changed);
  expect(select).not.toHaveBeenCalled();
  rerender(<MapView {...base} merchants={[second]} onSelectMerchant={latestSelect} />);
  expect(mockCluster.removeLayers).toHaveBeenCalledWith([marker]);
});

test("replacing results cancels pending batches and removes old markers", async () => {
  const { rerender, unmount } = render(<MapView {...base} merchants={Array.from({ length: 250 }, (_, i) => merchant(i + 1))} onSelectMerchant={jest.fn()} />);
  await waitFor(() => expect(mockCluster.addLayers).toHaveBeenCalledTimes(1));
  expect(mockCluster.addLayers.mock.calls[0][0]).toHaveLength(100);
  const oldCallback = [...frames.values()][0];
  rerender(<MapView {...base} merchants={[merchant(999)]} onSelectMerchant={jest.fn()} />);
  expect(mockCluster.removeLayers.mock.calls[0][0]).toHaveLength(100);
  expect(frames.size).toBe(0);
  const count = mockCluster.addLayers.mock.calls.length;
  act(() => oldCallback(0));
  expect(mockCluster.addLayers).toHaveBeenCalledTimes(count);
  unmount();
  expect(mockMap.remove).toHaveBeenCalled();
});

test("valid zero coordinates can be selected and invalid coordinates never become markers", async () => {
  const zero = { ...merchant(1), lat: 0, lon: 0 };
  render(<MapView {...base} merchants={[zero, { ...merchant(2), lat: NaN }]} selectedMerchant={zero} onSelectMerchant={jest.fn()} />);
  await waitFor(() => expect(mockCluster.addLayers).toHaveBeenCalled());
  expect(mockCluster.addLayers.mock.calls[0][0]).toHaveLength(1);
  expect(mockMap.flyTo).toHaveBeenCalledWith([0, 0], 15, expect.anything());
});
