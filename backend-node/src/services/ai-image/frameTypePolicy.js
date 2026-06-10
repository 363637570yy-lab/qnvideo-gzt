const LAST_FRAME_TYPES = new Set(['last', 'storyboard_last', 'tail', 'last_frame']);
const NON_BIND_STORYBOARD_FRAME_TYPES = new Set([
  'storyboard_keyframe',
  'storyboard_motion_sketch',
  'storyboard_layout_sketch',
  'storyboard_pose_ref',
  'storyboard_camera_path',
  'storyboard_aux_ref',
]);

function shouldBindStoryboardFrame(frameType) {
  const ft = String(frameType || '').toLowerCase();
  if (!ft) return true;
  if (ft === 'quad_grid' || ft === 'nine_grid') return false;
  return !NON_BIND_STORYBOARD_FRAME_TYPES.has(ft);
}

function isLastFrameType(frameType) {
  if (frameType == null || frameType === '') return false;
  return LAST_FRAME_TYPES.has(String(frameType).toLowerCase());
}

function resolveUseFirstFrameLayoutLock(req, frameType) {
  if (!isLastFrameType(frameType)) return null;
  const v = req?.use_first_frame_layout_lock;
  if (v === false || v === 0 || v === '0') return 0;
  if (v === true || v === 1 || v === '1') return 1;
  return 1;
}

function rowUseFirstFrameLayoutLock(row) {
  if (!row || !isLastFrameType(row.frame_type)) return false;
  const v = row.use_first_frame_layout_lock;
  if (v === 0 || v === false) return false;
  return true;
}

module.exports = {
  shouldBindStoryboardFrame,
  isLastFrameType,
  resolveUseFirstFrameLayoutLock,
  rowUseFirstFrameLayoutLock,
};
