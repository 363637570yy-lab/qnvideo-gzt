const response = require('../response');
const angleService = require('../services/angleService');

function createStoryboardBatchInferHandler({ db, log }) {
  return (req, res) => {
    try {
      const episodeId = Number(req.body?.episode_id);
      const overwrite = !!req.body?.overwrite;
      if (!episodeId) return response.badRequest(res, 'episode_id 必填');

      const rows = db.prepare(
        'SELECT id, angle_s, shot_type, atmosphere, time, description, action, movement, lighting_style, depth_of_field FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL ORDER BY storyboard_number ASC'
      ).all(episodeId);

      let updated = 0;
      const now = new Date().toISOString();
      const stmt = db.prepare(
        'UPDATE storyboards SET movement = COALESCE(?, movement), lighting_style = COALESCE(?, lighting_style), depth_of_field = COALESCE(?, depth_of_field), updated_at = ? WHERE id = ?'
      );
      const stmtOverwrite = db.prepare(
        'UPDATE storyboards SET movement = ?, lighting_style = ?, depth_of_field = ?, updated_at = ? WHERE id = ?'
      );

      for (const row of rows) {
        const inferred = angleService.inferPhotographyParams(row);
        const newMovement = overwrite ? inferred.movement : (row.movement ? null : inferred.movement);
        const newLighting = overwrite ? inferred.lighting_style : (row.lighting_style ? null : inferred.lighting_style);
        const newDof = overwrite ? inferred.depth_of_field : (row.depth_of_field ? null : inferred.depth_of_field);

        if (overwrite) {
          if (inferred.movement || inferred.lighting_style || inferred.depth_of_field) {
            stmtOverwrite.run(inferred.movement, inferred.lighting_style, inferred.depth_of_field, now, row.id);
            updated++;
          }
        } else if (newMovement || newLighting || newDof) {
          stmt.run(newMovement, newLighting, newDof, now, row.id);
          updated++;
        }
      }

      log.info('[分镜] batchInferParams 完成', { episode_id: episodeId, total: rows.length, updated, overwrite });
      response.success(res, { total: rows.length, updated });
    } catch (err) {
      log.error('storyboards batchInferParams', { error: err.message });
      response.internalError(res, err.message);
    }
  };
}

module.exports = { createStoryboardBatchInferHandler };
