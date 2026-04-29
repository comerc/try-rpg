#!/usr/bin/env python3
from __future__ import annotations

import os
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class GridSpec:
  cols: int
  rows: int


def _distributed_sizes(total: int, count: int) -> list[int]:
  base, rem = divmod(total, count)
  return [base + 1] * rem + [base] * (count - rem)


def _color_close(a: tuple[int, int, int, int], b: tuple[int, int, int, int], tol: int) -> bool:
  return (
    abs(a[0] - b[0]) <= tol
    and abs(a[1] - b[1]) <= tol
    and abs(a[2] - b[2]) <= tol
    and abs(a[3] - b[3]) <= tol
  )


def _estimate_bg(im: Image.Image) -> tuple[int, int, int, int]:
  w, h = im.size
  px = im.load()

  # Background in these atlases is typically a dominant flat color, but corners may contain sprite pixels.
  # Estimate by taking the most frequent color on a downsampled grid over the whole image.
  freq: dict[tuple[int, int, int, int], int] = {}
  step = 4
  for y in range(0, h, step):
    for x in range(0, w, step):
      c = px[x, y]
      freq[c] = freq.get(c, 0) + 1
  return max(freq.items(), key=lambda kv: kv[1])[0]


def _is_green_chromakey(c: tuple[int, int, int, int]) -> bool:
  r, g, b, a = c
  return a >= 240 and g >= 170 and r <= 110 and b <= 110 and g > r * 1.6 and g > b * 1.6


def _is_pink_chromakey(c: tuple[int, int, int, int]) -> bool:
  r, g, b, a = c
  return a >= 240 and r >= 115 and b >= 115 and g <= 190 and r - g >= 25 and b - g >= 18


def _make_chromakey_transparent(cell: Image.Image, background_test) -> Image.Image:
  im = cell.copy().convert("RGBA")
  px = im.load()
  w, h = im.size
  for y in range(h):
    for x in range(w):
      if background_test(px[x, y]):
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
  return im


def _make_edge_chromakey_transparent(cell: Image.Image, background_test=_is_green_chromakey) -> Image.Image:
  im = cell.copy().convert("RGBA")
  w, h = im.size
  if w == 0 or h == 0:
    return im

  px = im.load()
  queue: deque[tuple[int, int]] = deque()
  seen: set[tuple[int, int]] = set()

  def add_if_key(x: int, y: int) -> None:
    if (x, y) not in seen and background_test(px[x, y]):
      seen.add((x, y))
      queue.append((x, y))

  for x in range(w):
    add_if_key(x, 0)
    add_if_key(x, h - 1)
  for y in range(h):
    add_if_key(0, y)
    add_if_key(w - 1, y)

  while queue:
    x, y = queue.popleft()
    r, g, b, _ = px[x, y]
    px[x, y] = (r, g, b, 0)
    if x > 0:
      add_if_key(x - 1, y)
    if x + 1 < w:
      add_if_key(x + 1, y)
    if y > 0:
      add_if_key(x, y - 1)
    if y + 1 < h:
      add_if_key(x, y + 1)

  return im


def _group_runs(indices: list[int]) -> list[tuple[int, int]]:
  if not indices:
    return []
  runs: list[tuple[int, int]] = []
  start = prev = indices[0]
  for i in indices[1:]:
    if i == prev + 1:
      prev = i
      continue
    runs.append((start, prev))
    start = prev = i
  runs.append((start, prev))
  return runs


def _find_cuts(im: Image.Image, *, count: int, axis: str, bg: tuple[int, int, int, int], tol: int) -> list[int] | None:
  w, h = im.size
  px = im.load()

  if axis == "x":
    span = w
    other = h
    def sample(i: int, j: int) -> tuple[int, int, int, int]:
      return px[i, j]
  elif axis == "y":
    span = h
    other = w
    def sample(i: int, j: int) -> tuple[int, int, int, int]:
      return px[j, i]
  else:
    raise ValueError("axis must be x or y")

  # For each coordinate, compute fraction of pixels that match background.
  # Note: some atlases have little/no clean gutters, so we use this as a heuristic only.
  bg_like: list[bool] = []
  non_bg_ratio: list[float] = []
  for i in range(span):
    hits = 0
    # stride to speed up; good enough for gutters
    step = 2
    for j in range(0, other, step):
      if _color_close(sample(i, j), bg, tol):
        hits += 1
    ratio = hits / ((other + step - 1) // step)
    # Gutters aren't always fully clean (AA / noise), so accept "mostly background".
    bg_like.append(ratio >= 0.90)
    non_bg_ratio.append(1.0 - ratio)

  gutter_indices = [i for i, ok in enumerate(bg_like) if ok]
  runs = _group_runs(gutter_indices)
  expected_step = span / count
  cuts: list[int] = []

  # 1) If we have reliable gutter runs, pick cut centers near expected positions.
  if runs:
    for k in range(1, count):
      expected = k * expected_step
      window = expected_step * 0.55
      candidates: list[tuple[float, int]] = []
      for a, b in runs:
        mid = (a + b) // 2
        if abs(mid - expected) <= window:
          width = (b - a + 1)
          score = abs(mid - expected) - width * 0.15
          candidates.append((score, mid))
      if not candidates:
        cuts = []
        break
      candidates.sort(key=lambda t: t[0])
      cuts.append(candidates[0][1])
    if cuts:
      # Validate widths: reject if we clearly missed a separator (giant segment).
      bounds = _bounds_from_cuts(span, cuts)
      widths = [b - a for a, b in bounds]
      if max(widths) <= expected_step * 1.45 and min(widths) >= expected_step * 0.55:
        return cuts
      cuts = []

  # 2) Fallback: pick local minima of non-background ratio near expected positions.
  # This works even when gutters aren't fully background-colored.
  min_w = expected_step * 0.70
  max_w = expected_step * 1.30
  prev = 0
  for k in range(1, count):
    expected = k * expected_step
    lo = max(prev + int(min_w), 1)
    hi = min(prev + int(max_w), span - 2)
    if lo > hi:
      return None
    best_i = None
    best_score = 1e9
    for i in range(lo, hi + 1):
      remaining = (count - k)
      rem_span = span - i
      if remaining > 0:
        if rem_span < remaining * min_w:
          continue
        if rem_span > remaining * max_w:
          continue
      score = non_bg_ratio[i]
      score += abs(i - expected) / expected_step * 0.12
      if score < best_score:
        best_score = score
        best_i = i
    if best_i is None:
      return None
    cuts.append(int(best_i))
    prev = int(best_i)
  return cuts


def _bounds_from_cuts(total: int, cuts: list[int]) -> list[tuple[int, int]]:
  pts = [0] + sorted(cuts) + [total]
  out: list[tuple[int, int]] = []
  for a, b in zip(pts, pts[1:]):
    out.append((a, b))
  return out


def _find_separator_runs_by_color(
  im: Image.Image,
  *,
  axis: str,
  sep_color: tuple[int, int, int, int],
  tol: int,
  min_ratio: float,
) -> list[tuple[int, int]]:
  w, h = im.size
  px = im.load()
  if axis == "x":
    span = w
    other = h
    def sample(i: int, j: int) -> tuple[int, int, int, int]:
      return px[i, j]
  elif axis == "y":
    span = h
    other = w
    def sample(i: int, j: int) -> tuple[int, int, int, int]:
      return px[j, i]
  else:
    raise ValueError("axis must be x or y")

  is_sep: list[bool] = []
  for i in range(span):
    hits = 0
    step = 2
    for j in range(0, other, step):
      if _color_close(sample(i, j), sep_color, tol):
        hits += 1
    ratio = hits / ((other + step - 1) // step)
    is_sep.append(ratio >= min_ratio)

  indices = [i for i, ok in enumerate(is_sep) if ok]
  return _group_runs(indices)


def _bounds_from_separator_runs(total: int, sep_runs: list[tuple[int, int]], *, cells: int) -> list[tuple[int, int]] | None:
  """
  Converts N-1 separator runs into N cell bounds by cutting BETWEEN separators.
  Separator pixels themselves are excluded from cells.
  """
  if cells < 1:
    return None
  need = cells - 1
  if need == 0:
    return [(0, total)]
  if len(sep_runs) < need:
    return None

  # Pick runs that are closest to expected positions (handles uneven cell sizes).
  expected_step = total / cells
  chosen: list[tuple[int, int]] = []
  remaining = sep_runs[:]
  for k in range(1, cells):
    expected = k * expected_step
    best = None
    best_score = 1e9
    for r in remaining:
      a, b = r
      mid = (a + b) / 2
      score = abs(mid - expected) - (b - a + 1) * 0.05
      if score < best_score:
        best_score = score
        best = r
    if best is None:
      return None
    chosen.append(best)
    remaining.remove(best)
  chosen.sort(key=lambda t: t[0])

  bounds: list[tuple[int, int]] = []
  start = 0
  for a, b in chosen:
    end = max(start, a)  # stop before separator starts
    bounds.append((start, end))
    start = min(total, b + 1)  # resume after separator ends
  bounds.append((start, total))

  if len(bounds) != cells:
    return None
  # Basic sanity: no empty cells.
  if any(b <= a for a, b in bounds):
    return None
  return bounds


def _merge_close_runs(runs: list[tuple[int, int]], *, max_gap: int) -> list[tuple[int, int]]:
  if not runs:
    return []
  merged = [runs[0]]
  for a, b in runs[1:]:
    prev_a, prev_b = merged[-1]
    if a - prev_b <= max_gap:
      merged[-1] = (prev_a, b)
    else:
      merged.append((a, b))
  return merged


def _find_white_grid_bounds(im: Image.Image, *, cols: int, rows: int) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
  def whiteish(c: tuple[int, int, int, int]) -> bool:
    return c[3] >= 240 and c[0] >= 240 and c[1] >= 240 and c[2] >= 240

  def find_runs(axis: str) -> list[tuple[int, int]]:
    w, h = im.size
    span = w if axis == "x" else h
    other = h if axis == "x" else w
    px = im.load()
    runs: list[tuple[int, int]] = []
    start = None
    for i in range(span):
      hits = 0
      for j in range(other):
        x, y = (i, j) if axis == "x" else (j, i)
        if whiteish(px[x, y]):
          hits += 1
      if hits / other >= 0.95:
        if start is None:
          start = i
      elif start is not None:
        runs.append((start, i - 1))
        start = None
    if start is not None:
      runs.append((start, span - 1))
    return _merge_close_runs(runs, max_gap=2)

  def bounds_from_grid(runs: list[tuple[int, int]], cells: int, total: int) -> list[tuple[int, int]]:
    if len(runs) != cells + 1:
      raise ValueError(f"Expected {cells + 1} white grid lines, found {len(runs)}: {runs}")
    bounds = []
    for left_line, right_line in zip(runs, runs[1:]):
      bounds.append((left_line[1] + 1, right_line[0]))
    if any(b <= a for a, b in bounds):
      raise ValueError(f"Invalid grid bounds for total={total}: {bounds}")
    return bounds

  x_runs = find_runs("x")
  y_runs = find_runs("y")
  return bounds_from_grid(x_runs, cols, im.size[0]), bounds_from_grid(y_runs, rows, im.size[1])


def _trim_bg_margins(
  cell: Image.Image,
  *,
  bg: tuple[int, int, int, int],
  tol: int,
  keep_pad: int,
  threshold: float = 0.995,
) -> Image.Image:
  """
  Trims fully-background-like margins from all sides, conservatively.
  This fixes atlases where the last row/col has extra background padding.
  """
  im = cell
  for _ in range(8):  # converge quickly; each pass may reveal more trim
    w, h = im.size
    if w <= 2 or h <= 2:
      break
    px = im.load()

    def row_bg_ratio(y: int) -> float:
      hits = 0
      for x in range(w):
        if _color_close(px[x, y], bg, tol):
          hits += 1
      return hits / w

    def col_bg_ratio(x: int) -> float:
      hits = 0
      for y in range(h):
        if _color_close(px[x, y], bg, tol):
          hits += 1
      return hits / h

    thr = threshold

    top = 0
    while top < h and row_bg_ratio(top) >= thr:
      top += 1
    bottom = h - 1
    while bottom >= 0 and row_bg_ratio(bottom) >= thr:
      bottom -= 1
    left = 0
    while left < w and col_bg_ratio(left) >= thr:
      left += 1
    right = w - 1
    while right >= 0 and col_bg_ratio(right) >= thr:
      right -= 1

    if right < left or bottom < top:
      break

    # Keep a small safety padding.
    top = max(0, top - keep_pad)
    left = max(0, left - keep_pad)
    bottom = min(h - 1, bottom + keep_pad)
    right = min(w - 1, right + keep_pad)

    new_im = im.crop((left, top, right + 1, bottom + 1))
    if new_im.size == im.size:
      break
    im = new_im
  return im


def _trim_near_white_margins(cell: Image.Image, *, keep_pad: int = 0) -> Image.Image:
  """
  Trims white/near-white border pixels from all sides.
  This is used for the environment atlas, where the separator grid leaves a white fringe.
  """
  im = cell
  for _ in range(8):
    w, h = im.size
    if w <= 2 or h <= 2:
      break
    px = im.load()

    def is_whiteish(c: tuple[int, int, int, int]) -> bool:
      return c[3] >= 250 and c[0] >= 235 and c[1] >= 235 and c[2] >= 235

    top = 0
    while top < h and all(is_whiteish(px[x, top]) for x in range(w)):
      top += 1
    bottom = h - 1
    while bottom >= 0 and all(is_whiteish(px[x, bottom]) for x in range(w)):
      bottom -= 1
    left = 0
    while left < w and all(is_whiteish(px[left, y]) for y in range(h)):
      left += 1
    right = w - 1
    while right >= 0 and all(is_whiteish(px[right, y]) for y in range(h)):
      right -= 1

    if right < left or bottom < top:
      break

    top = max(0, top - keep_pad)
    left = max(0, left - keep_pad)
    bottom = min(h - 1, bottom + keep_pad)
    right = min(w - 1, right + keep_pad)

    new_im = im.crop((left, top, right + 1, bottom + 1))
    if new_im.size == im.size:
      break
    im = new_im
  return im


def _trim_near_white_edges(cell: Image.Image, *, ratio_threshold: float = 0.75) -> Image.Image:
  """
  Trims rows/columns that are mostly white-ish. This is safer for the environment
  atlas than a pure pixel-color trim because the border isn't perfectly uniform.
  """
  im = cell
  for _ in range(6):
    w, h = im.size
    if w <= 2 or h <= 2:
      break
    px = im.load()

    def whiteish(c: tuple[int, int, int, int]) -> bool:
      return c[3] >= 240 and c[0] >= 235 and c[1] >= 235 and c[2] >= 235

    def row_ratio(y: int) -> float:
      return sum(whiteish(px[x, y]) for x in range(w)) / w

    def col_ratio(x: int) -> float:
      return sum(whiteish(px[x, y]) for y in range(h)) / h

    top = 0
    while top < h and row_ratio(top) >= ratio_threshold:
      top += 1
    bottom = h - 1
    while bottom >= 0 and row_ratio(bottom) >= ratio_threshold:
      bottom -= 1
    left = 0
    while left < w and col_ratio(left) >= ratio_threshold:
      left += 1
    right = w - 1
    while right >= 0 and col_ratio(right) >= ratio_threshold:
      right -= 1

    if right < left or bottom < top:
      break
    new_im = im.crop((left, top, right + 1, bottom + 1))
    if new_im.size == im.size:
      break
    im = new_im
  return im


def _crop_white_edge_pixels(cell: Image.Image, *, max_passes: int = 12) -> Image.Image:
  im = cell

  def whiteish(c: tuple[int, int, int, int]) -> bool:
    return c[3] >= 240 and c[0] >= 235 and c[1] >= 235 and c[2] >= 235

  for _ in range(max_passes):
    w, h = im.size
    if w <= 2 or h <= 2:
      break
    px = im.load()
    top = any(whiteish(px[x, 0]) for x in range(w))
    bottom = any(whiteish(px[x, h - 1]) for x in range(w))
    left = any(whiteish(px[0, y]) for y in range(h))
    right = any(whiteish(px[w - 1, y]) for y in range(h))
    if not (top or bottom or left or right):
      break
    im = im.crop((1 if left else 0, 1 if top else 0, w - (1 if right else 0), h - (1 if bottom else 0)))
  return im


def _detect_content_runs(
  im: Image.Image,
  *,
  y0: int,
  y1: int,
  background_test,
) -> list[tuple[int, int]]:
  px = im.load()
  w = im.size[0]
  counts: list[int] = []
  for x in range(w):
    non = 0
    for y in range(y0, y1 + 1):
      if not background_test(px[x, y]):
        non += 1
    counts.append(non)

  runs: list[tuple[int, int]] = []
  in_run = False
  start = 0
  for x, c in enumerate(counts):
    if c > 0 and not in_run:
      in_run = True
      start = x
    elif c == 0 and in_run:
      in_run = False
      runs.append((start, x - 1))
  if in_run:
    runs.append((start, w - 1))
  return runs


def _detect_background_runs(
  im: Image.Image,
  *,
  y0: int,
  y1: int,
  background_test,
) -> list[tuple[int, int]]:
  px = im.load()
  w = im.size[0]
  runs: list[tuple[int, int]] = []
  in_run = False
  start = 0
  for x in range(w):
    if all(background_test(px[x, y]) for y in range(y0, y1 + 1)):
      if not in_run:
        in_run = True
        start = x
    elif in_run:
      in_run = False
      runs.append((start, x - 1))
  if in_run:
    runs.append((start, w - 1))
  return runs


def _crop_to_content_bbox(cell: Image.Image, *, bg: tuple[int, int, int, int], tol: int, pad: int) -> Image.Image:
  w, h = cell.size
  px = cell.load()
  minx, miny = w, h
  maxx, maxy = -1, -1
  for y in range(h):
    for x in range(w):
      if not _color_close(px[x, y], bg, tol):
        if x < minx:
          minx = x
        if y < miny:
          miny = y
        if x > maxx:
          maxx = x
        if y > maxy:
          maxy = y
  if maxx < minx or maxy < miny:
    return cell
  minx = max(0, minx - pad)
  miny = max(0, miny - pad)
  maxx = min(w - 1, maxx + pad)
  maxy = min(h - 1, maxy + pad)
  return cell.crop((minx, miny, maxx + 1, maxy + 1))


def slice_grid(
  image_path: Path,
  out_dir: Path,
  *,
  spec: GridSpec,
  names_x: list[str],
  names_y: list[str],
  crop_mode: str = "trim_margins",  # trim_margins | content_bbox | none
  trim_bg: tuple[int, int, int, int] | None = None,
  separator_color: tuple[int, int, int, int] | None = None,
  force_even_grid: bool = False,
) -> None:
  if len(names_x) != spec.cols:
    raise ValueError(f"{image_path}: names_x has {len(names_x)} items, expected {spec.cols}")
  if len(names_y) != spec.rows:
    raise ValueError(f"{image_path}: names_y has {len(names_y)} items, expected {spec.rows}")

  im = Image.open(image_path).convert("RGBA")
  w, h = im.size

  bg = _estimate_bg(im)
  tol = 14
  tol_content = 25
  x_bounds = None
  y_bounds = None
  x_cuts = None if force_even_grid else _find_cuts(im, count=spec.cols, axis="x", bg=bg, tol=tol)
  y_cuts = None if force_even_grid else _find_cuts(im, count=spec.rows, axis="y", bg=bg, tol=tol)

  if image_path.name == "gpt-image-2-environment-animation-atlas.png":
    x_bounds, y_bounds = _find_white_grid_bounds(im, cols=spec.cols, rows=spec.rows)

  if image_path.name == "gpt-image-2-unit-animation-atlas.png":
    def is_green(c: tuple[int, int, int, int]) -> bool:
      return c[1] > 230 and c[0] < 70 and c[2] < 70

    row_bands = [(22, 152), (169, 304), (317, 446), (467, 598), (613, 749), (758, 886)]
    row_gap_runs = [_detect_background_runs(im, y0=a, y1=b, background_test=is_green) for a, b in row_bands]
    if all(len(runs) >= spec.cols + 1 for runs in row_gap_runs):
      y_bounds = [(a, b + 1) for a, b in row_bands]
      column_cuts: list[int] = [0]
      for separator_index in range(1, spec.cols):
        mids = sorted((runs[separator_index][0] + runs[separator_index][1]) // 2 for runs in row_gap_runs)
        column_cuts.append(mids[len(mids) // 2])
      column_cuts.append(im.size[0])
      x_bounds = [(a, b) for a, b in zip(column_cuts, column_cuts[1:])]

  if x_bounds is None:
    if x_cuts is not None:
      x_bounds = _bounds_from_cuts(w, x_cuts)
    else:
      widths = _distributed_sizes(w, spec.cols)
      x_bounds = []
      x0 = 0
      for cw in widths:
        x_bounds.append((x0, x0 + cw))
        x0 += cw

  if y_bounds is None:
    if y_cuts is not None:
      y_bounds = _bounds_from_cuts(h, y_cuts)
    else:
      heights = _distributed_sizes(h, spec.rows)
      y_bounds = []
      y0 = 0
      for rh in heights:
        y_bounds.append((y0, y0 + rh))
        y0 += rh

  out_dir.mkdir(parents=True, exist_ok=True)

  for row, (y0, y1) in enumerate(y_bounds):
    for col, (x0, x1) in enumerate(x_bounds):
      crop = im.crop((x0, y0, x1, y1))
      if crop_mode == "trim_margins":
        crop = _trim_bg_margins(crop, bg=bg, tol=tol, keep_pad=2)
      elif crop_mode == "content_bbox":
        crop = _crop_to_content_bbox(crop, bg=bg, tol=tol_content, pad=2)
      elif crop_mode == "none":
        pass
      else:
        raise ValueError(f"{image_path}: unknown crop_mode={crop_mode}")

      if image_path.name == "gpt-image-2-environment-animation-atlas.png":
        trim = 5
        crop = crop.crop((trim, trim, max(trim, crop.size[0] - trim), max(trim, crop.size[1] - trim)))
        crop = _crop_white_edge_pixels(crop)
        if names_y[row] in {"tree", "mine"}:
          crop = _make_chromakey_transparent(crop, _is_pink_chromakey)
      elif image_path.name == "gpt-image-2-building-stage-atlas.png":
        crop = _make_edge_chromakey_transparent(crop)

      name = f"{names_y[row]}__{names_x[col]}.png"
      crop.save(out_dir / name)


def slice_units(image_path: Path, out_dir: Path) -> None:
  im = Image.open(image_path).convert("RGBA")
  w, h = im.size
  px = im.load()

  def is_green(c: tuple[int, int, int, int]) -> bool:
    return c[3] >= 250 and c[1] > 230 and c[0] < 70 and c[2] < 70

  names_x = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11"]
  names_y = [
    "peasant-blue",
    "swordsman-blue",
    "archer-blue",
    "peasant-red",
    "swordsman-red",
    "archer-red",
  ]
  row_green_gaps = [(0, 21), (153, 168), (305, 317), (447, 466), (599, 613), (750, 757)]
  row_cuts = [0]
  for gap in row_green_gaps[1:]:
    row_cuts.append((gap[0] + gap[1]) // 2)
  row_cuts.append(h)
  row_windows = [(a, b) for a, b in zip(row_cuts, row_cuts[1:])]

  content_pad = 2
  output_pad = 8
  chromakey = (4, 247, 4, 255)

  out_dir.mkdir(parents=True, exist_ok=True)

  for row, (y0, y1) in enumerate(row_windows):
    gaps: list[tuple[int, int]] = []
    start = None
    for x in range(w):
      if all(is_green(px[x, y]) for y in range(y0, y1)):
        if start is None:
          start = x
      elif start is not None:
        gaps.append((start, x - 1))
        start = None
    if start is not None:
      gaps.append((start, w - 1))
    if len(gaps) < len(names_x) + 1:
      raise ValueError(f"{image_path}: expected at least {len(names_x) + 1} green gaps in row {row}, found {len(gaps)}: {gaps}")

    for col, frame_name in enumerate(names_x):
      left_gap = gaps[col]
      right_gap = gaps[col + 1]
      x0 = max(0, (left_gap[0] + left_gap[1]) // 2)
      x1 = min(w, (right_gap[0] + right_gap[1]) // 2 + 1)
      cell = im.crop((x0, y0, x1, y1))
      cell_px = cell.load()
      min_x, min_y = cell.size[0], cell.size[1]
      max_x, max_y = -1, -1
      for yy in range(cell.size[1]):
        for xx in range(cell.size[0]):
          if not is_green(cell_px[xx, yy]):
            min_x = min(min_x, xx)
            min_y = min(min_y, yy)
            max_x = max(max_x, xx)
            max_y = max(max_y, yy)
      if max_x < min_x or max_y < min_y:
        crop = cell
      else:
        crop = cell.crop((
          max(0, min_x - content_pad),
          max(0, min_y - content_pad),
          min(cell.size[0], max_x + content_pad + 1),
          min(cell.size[1], max_y + content_pad + 1),
        ))
      framed = Image.new("RGBA", (crop.size[0] + output_pad * 2, crop.size[1] + output_pad * 2), chromakey)
      framed.paste(crop, (output_pad, output_pad))
      crop = _make_edge_chromakey_transparent(framed)
      crop.save(out_dir / f"{names_y[row]}__{frame_name}.png")


def main() -> None:
  root = Path(__file__).resolve().parents[1]

  buildings_atlas = root / "assets/generated2/animation/gpt-image-2-building-stage-atlas.png"
  env_atlas = root / "assets/generated2/animation/gpt-image-2-environment-animation-atlas.png"
  units_atlas = root / "assets/generated2/animation/gpt-image-2-unit-animation-atlas.png"

  out_root = root / "assets/generated2/sliced"

  slice_grid(
    buildings_atlas,
    out_root / "buildings",
    spec=GridSpec(cols=6, rows=8),
    names_x=["build1", "build2", "build3", "ready", "under-attack", "destroyed"],
    names_y=[
      "townhall-blue",
      "townhall-red",
      "barracks-blue",
      "barracks-red",
      "farm-blue",
      "farm-red",
      "tower-blue",
      "tower-red",
    ],
    crop_mode="trim_margins",
  )

  # Environment atlas: 5 rows by 6 frames (assumed).
  slice_grid(
    env_atlas,
    out_root / "environment",
    spec=GridSpec(cols=4, rows=5),
    names_x=["f1", "f2", "f3", "f4"],
    names_y=["tree", "mine", "water", "grass", "dirt"],
    crop_mode="trim_margins",
    trim_bg=(255, 255, 255, 255),
    separator_color=(255, 255, 255, 255),
  )

  slice_units(units_atlas, out_root / "units")

  print("OK:", out_root)


if __name__ == "__main__":
  main()
