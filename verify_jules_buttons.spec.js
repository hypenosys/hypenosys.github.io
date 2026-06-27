const { test, expect } = require('@playwright/test');

test('Verify Nueva Sesion and Nueva Tarea buttons in Jules Panel', async ({ page }) => {
  await page.goto('http://localhost:4000/jules-panel/');

  // Bypass auth
  await page.waitForSelector('#auth-overlay.show');
  await page.click('text=Bypass (Read Only)');
  await page.waitForSelector('#auth-overlay:not(.show)');

  // 1. Verify "Nueva sesión" button
  console.log('Testing "Nueva sesión" button...');
  const newSessBtn = page.locator('#hdr-new-btn');
  await expect(newSessBtn).toBeVisible();
  await newSessBtn.click();

  // Should switch to chat view
  const chatView = page.locator('#view-chat');
  await expect(chatView).toHaveClass(/active/);

  // 2. Verify "Nueva Tarea" button (Kanban)
  console.log('Testing "Nueva Tarea" button...');
  await page.click('[data-view="kanban"]');
  const kanbanView = page.locator('#view-kanban');
  await expect(kanbanView).toHaveClass(/active/);

  const newTaskBtn = page.locator('text=+ Nueva Tarea').first();
  await expect(newTaskBtn).toBeVisible();
  await newTaskBtn.click();

  const modal = page.locator('#new-task-modal');
  await expect(modal).toHaveClass(/open/);

  // Fill and cancel
  await page.fill('#nt-desc', 'Test task description');
  await page.click('#new-task-modal button:has-text("Cancelar")');
  await expect(modal).not.toHaveClass(/open/);

  // Open again and test "En Progreso" logic
  await newTaskBtn.click();
  await page.fill('#nt-desc', 'Immediate task');
  await page.click('#new-task-modal button:has-text("En Progreso")');

  // Intercepting or just checking view switch
  await page.click('#new-task-modal button:has-text("Crear Tarea")');

  // Should switch to neural (agent) view
  const neuralView = page.locator('#view-neural');
  await expect(neuralView).toHaveClass(/active/);

  const promptArea = page.locator('#session-prompt');
  await expect(promptArea).toHaveValue('Immediate task');

  console.log('Verification passed!');
});
