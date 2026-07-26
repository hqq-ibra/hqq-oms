import { join } from 'path';
import { resolveUploadsRoot, uploadsPath, UPLOADS_ROOT } from '../uploads';

describe('resolveUploadsRoot', () => {
  const cwd = '/opt/hqq-oms/apps/api';

  it('falls back to join(cwd, "uploads") when UPLOADS_DIR is unset', () => {
    expect(resolveUploadsRoot({}, cwd)).toBe(join(cwd, 'uploads'));
  });

  it('uses UPLOADS_DIR verbatim when set to an absolute path', () => {
    const configured = '/mnt/data/uploads';
    expect(resolveUploadsRoot({ UPLOADS_DIR: configured }, cwd)).toBe(
      configured,
    );
  });

  it('falls back to the cwd default when UPLOADS_DIR is an empty string', () => {
    expect(resolveUploadsRoot({ UPLOADS_DIR: '' }, cwd)).toBe(
      join(cwd, 'uploads'),
    );
  });

  it('falls back to the cwd default when UPLOADS_DIR is whitespace only', () => {
    expect(resolveUploadsRoot({ UPLOADS_DIR: '   ' }, cwd)).toBe(
      join(cwd, 'uploads'),
    );
  });
});

describe('uploadsPath', () => {
  it('joins segments beneath the resolved uploads root', () => {
    expect(uploadsPath('products', 'x.pdf')).toBe(
      join(UPLOADS_ROOT, 'products', 'x.pdf'),
    );
  });
});
