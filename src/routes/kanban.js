const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { crudFactory } = require('../lib/crudFactory');

const router = express.Router();
const prisma = new PrismaClient();
const crud = crudFactory(prisma.kanbanCard, { bulkFields: ['column', 'priority'] });

router.get('/', crud.getAll);
router.post('/', crud.create);
router.put('/:id', crud.update);
router.delete('/:id', crud.remove);
router.patch('/reorder', crud.reorder);
router.patch('/bulk', crud.bulkUpdate);

module.exports = router;
