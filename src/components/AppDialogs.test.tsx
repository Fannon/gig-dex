import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { confirmAction } from "../utils/confirm";
import { showToast } from "../utils/toast";
import { AppDialogs } from "./AppDialogs";

beforeAll(() => {
  // jsdom lacks modal dialogs; open/close is enough for these checks.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe("AppDialogs", () => {
  it("answers confirmations in order and focuses Cancel for destructive actions", async () => {
    render(<AppDialogs />);
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = confirmAction({ title: "Delete it?", confirmLabel: "Delete", danger: true });
      second = confirmAction({ title: "Restart?", confirmLabel: "Restart now" });
    });
    expect(screen.getByRole("alertdialog", { name: "Delete it?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(first).resolves.toBe(false);
    expect(screen.getByRole("alertdialog", { name: "Restart?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
    await expect(second).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows a toast whose action runs once and dismisses it", () => {
    render(<AppDialogs />);
    const undo = vi.fn();
    act(() => showToast({ message: "Deleted “Song”.", actionLabel: "Undo", action: undo }));
    expect(screen.getByText("Deleted “Song”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Deleted “Song”.")).toBeNull();
  });

  it("falls back to the browser dialog without a host", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await expect(confirmAction({ title: "Proceed?", message: "Details", confirmLabel: "OK" })).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith("Proceed?\n\nDetails");
    confirm.mockRestore();
  });
});
