-- Masulino migration 0013
-- The signed-in app may reload ready2order till lines for its own tenant.
-- Existing product classifications stay. New names may be inserted once.

GRANT INSERT, UPDATE, DELETE ON pos.lines TO masulino_app;
GRANT INSERT ON pos.product_categories TO masulino_app;
