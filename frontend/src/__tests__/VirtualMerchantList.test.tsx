import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import VirtualMerchantList, { type MerchantListHandle } from "@/components/VirtualMerchantList";
import type { MapMerchant } from "@/utils/mapMerchants";

const merchants: MapMerchant[] = Array.from({ length: 2000 }, (_, index) => ({
  id: index + 1, name: `商店 ${index + 1}`, address: "台北市", zip_code: null, tax_id: null,
  website: null, lat: 25, lon: 121, distance_km: 1, coord_accuracy: "verified",
}));

test("2,000 merchants render a bounded set of semantic cards and select the current record", () => {
  const select = jest.fn();
  render(<VirtualMerchantList merchants={merchants} onSelectMerchant={select} />);
  expect(screen.getAllByRole("article").length).toBeLessThan(15);
  expect(screen.queryByRole("article", { name: "商店 2000" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-setsize", "2000");
  fireEvent.click(screen.getByRole("button", { name: "查看 商店 1" }));
  expect(select).toHaveBeenCalledWith(merchants[0]);
});

test("map selection mounts and scrolls to a distant card, and appending preserves position", () => {
  const ref = createRef<MerchantListHandle>();
  const { rerender } = render(<VirtualMerchantList ref={ref} merchants={merchants} onSelectMerchant={jest.fn()} />);
  const viewport = screen.getByRole("region", { name: "附近商店列表" });
  Object.defineProperty(viewport, "clientHeight", { value: 520 });
  act(() => ref.current!.scrollToMerchant(1900));
  expect(screen.getByRole("article", { name: "商店 1900" })).toBeInTheDocument();
  expect(screen.getAllByRole("article").length).toBeLessThan(15);
  const position = viewport.scrollTop;
  rerender(<VirtualMerchantList ref={ref} merchants={[...merchants, { ...merchants[0], id: 2001 }]} onSelectMerchant={jest.fn()} />);
  expect(viewport.scrollTop).toBe(position);
});

test("an offscreen focused card stays mounted, while replacing results cannot leave an empty window", () => {
  const { rerender } = render(<VirtualMerchantList merchants={merchants} onSelectMerchant={jest.fn()} />);
  const button = screen.getByRole("button", { name: "查看 商店 1" });
  act(() => button.focus());
  const viewport = screen.getByRole("region");
  fireEvent.scroll(viewport, { target: { scrollTop: 100000 } });
  expect(button).toHaveFocus();
  expect(button).toBeInTheDocument();
  expect(screen.getAllByRole("article").length).toBeLessThan(16);
  rerender(<VirtualMerchantList merchants={[merchants[1999]]} onSelectMerchant={jest.fn()} />);
  expect(screen.getByRole("article", { name: "商店 2000" })).toBeInTheDocument();
});
