/**
 * Tests for VolumeSlider.tsx
 *
 * User Story: "Als User möchte ich die Lautstärke präzise steuern"
 *
 * Focus: Functional tests for volume control
 * - Volume display via aria-valuenow
 * - Mute/Unmute toggle
 * - Keyboard navigation (Arrow keys)
 * - Muted visual state
 * - Accessibility (aria-labels)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VolumeSlider from "../../src/components/VolumeSlider";

describe("VolumeSlider Component", () => {
  describe("Volume Display & Controls", () => {
    it("should render slider with correct volume via aria-valuenow", () => {
      render(
        <VolumeSlider volume={45} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "45");
    });

    it("should have correct aria range attributes", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-valuemin", "0");
      expect(slider).toHaveAttribute("aria-valuemax", "100");
      expect(slider).toHaveAttribute("aria-valuenow", "50");
    });

    it("should call onVolumeChange with +5 on ArrowRight", () => {
      const mockOnVolumeChange = vi.fn();
      render(
        <VolumeSlider volume={50} onVolumeChange={mockOnVolumeChange} muted={false} onMuteToggle={vi.fn()} />
      );
      fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
      expect(mockOnVolumeChange).toHaveBeenCalledWith(55);
    });

    it("should call onVolumeChange with -5 on ArrowLeft", () => {
      const mockOnVolumeChange = vi.fn();
      render(
        <VolumeSlider volume={50} onVolumeChange={mockOnVolumeChange} muted={false} onMuteToggle={vi.fn()} />
      );
      fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
      expect(mockOnVolumeChange).toHaveBeenCalledWith(45);
    });

    it("should clamp ArrowLeft at 0", () => {
      const mockOnVolumeChange = vi.fn();
      render(
        <VolumeSlider volume={3} onVolumeChange={mockOnVolumeChange} muted={false} onMuteToggle={vi.fn()} />
      );
      fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
      expect(mockOnVolumeChange).toHaveBeenCalledWith(0);
    });

    it("should clamp ArrowRight at 100", () => {
      const mockOnVolumeChange = vi.fn();
      render(
        <VolumeSlider volume={98} onVolumeChange={mockOnVolumeChange} muted={false} onMuteToggle={vi.fn()} />
      );
      fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
      expect(mockOnVolumeChange).toHaveBeenCalledWith(100);
    });
  });

  describe("Mute Functionality", () => {
    it("should toggle mute when button clicked", () => {
      const mockOnMuteToggle = vi.fn();
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={mockOnMuteToggle} />
      );
      fireEvent.click(screen.getByRole("button", { name: "Mute" }));
      expect(mockOnMuteToggle).toHaveBeenCalledTimes(1);
    });

    it("should apply muted CSS class to track when muted", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={true} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("slider")).toHaveClass("muted");
    });

    it("should show unmute label when muted", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={true} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    });

    it("should show mute label when not muted", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    });

    it("should apply muted CSS class to mute button when muted", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={true} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Unmute" })).toHaveClass("muted");
    });
  });

  describe("Dynamic Icon Display", () => {
    it("should show SVG icon in mute button when muted", () => {
      const { container } = render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={true} onMuteToggle={vi.fn()} />
      );
      expect(container.querySelector(".volume-mute svg")).toBeInTheDocument();
    });

    it("should show SVG icon in mute button when not muted", () => {
      const { container } = render(
        <VolumeSlider volume={75} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(container.querySelector(".volume-mute svg")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label Volume on slider", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    });

    it("should have dynamic aria-label on mute button", () => {
      const { rerender } = render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
      rerender(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={true} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    });

    it("should have tabIndex 0 for keyboard access", () => {
      render(
        <VolumeSlider volume={50} onVolumeChange={vi.fn()} muted={false} onMuteToggle={vi.fn()} />
      );
      expect(screen.getByRole("slider")).toHaveAttribute("tabindex", "0");
    });
  });
});
