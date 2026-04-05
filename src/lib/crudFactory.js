const { asyncHandler } = require('../middleware/errorHandler');

function crudFactory(prismaModel, options = {}) {
  const { orgField = 'orgId', reorderField = 'order', bulkFields = [] } = options;

  const getAll = asyncHandler(async (req, res) => {
    const orgId = req.query.orgId;
    const where = orgId ? { [orgField]: orgId } : {};
    const items = await prismaModel.findMany({
      where,
      orderBy: reorderField ? { [reorderField]: 'asc' } : undefined,
    });
    res.json(items);
  });

  const getOne = asyncHandler(async (req, res) => {
    const item = await prismaModel.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  const create = asyncHandler(async (req, res) => {
    const item = await prismaModel.create({ data: req.body });
    res.status(201).json(item);
  });

  const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Remove relational fields that can't be set directly
    const { org, ...data } = req.body;
    const item = await prismaModel.update({ where: { id }, data });
    res.json(item);
  });

  const remove = asyncHandler(async (req, res) => {
    await prismaModel.delete({ where: { id: req.params.id } });
    res.status(204).send();
  });

  const reorder = asyncHandler(async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be array' });
    await Promise.all(
      items.map(({ id, order }) =>
        prismaModel.update({ where: { id }, data: { [reorderField]: order } })
      )
    );
    res.json({ success: true });
  });

  const bulkUpdate = asyncHandler(async (req, res) => {
    const { ids, ...fields } = req.body;
    const allowedFields = Object.fromEntries(
      Object.entries(fields).filter(([k]) => bulkFields.includes(k))
    );
    await prismaModel.updateMany({ where: { id: { in: ids } }, data: allowedFields });
    res.json({ success: true });
  });

  return { getAll, getOne, create, update, remove, reorder, bulkUpdate };
}

module.exports = { crudFactory };
