import { Router } from 'express';
import { createOrder, listOrders, updateOrderStatus } from '../controllers/orderController.js';
import { validate } from '../validators/validate.js';
import { createOrderSchema, updateOrderStatusSchema } from '../validators/orderValidator.js';
const router = Router();
router.get('/orders', listOrders);
router.post('/orders', validate(createOrderSchema), createOrder);
router.patch('/orders/:id/status', validate(updateOrderStatusSchema), updateOrderStatus);
export default router;
