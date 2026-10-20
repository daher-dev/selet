// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

function renderSheet(body: React.ReactNode) {
  const onOpenChange = vi.fn();
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Drawer</SheetTitle>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>,
  );
  return onOpenChange;
}

// Radix arms its outside-press listener on the next tick.
const clickOutside = async () => {
  await new Promise((r) => setTimeout(r, 10));
  fireEvent.pointerDown(document.body);
  fireEvent.pointerUp(document.body);
  fireEvent.click(document.body);
};

describe("SheetContent outside click", () => {
  it("keeps a drawer with form controls open so in-progress edits survive", async () => {
    const onOpenChange = renderSheet(<input aria-label="Nome" defaultValue="Rascunho" />);
    await clickOutside();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Nome")).toHaveValue("Rascunho");
  });

  it("still closes a read-only drawer on an outside click", async () => {
    const onOpenChange = renderSheet(<p>Detalhes</p>);
    await clickOutside();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
