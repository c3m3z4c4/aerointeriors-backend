const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { crudFactory } = require('../lib/crudFactory');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
const crud = crudFactory(prisma.socialLink);

router.get('/', crud.getAll);
router.post('/', authenticate, requireAdmin, crud.create);
router.put('/:id', authenticate, requireAdmin, crud.update);
router.delete('/:id', authenticate, requireAdmin, crud.remove);
router.patch('/reorder', authenticate, requireAdmin, crud.reorder);

module.exports = router;
