UPDATE books
SET accent_color = '#EBEBEB'
WHERE accent_color = '#A77C8A';

UPDATE books
SET accent_color = '#F7F2E7'
WHERE accent_color = '#6F7F72';

UPDATE books
SET page_color = '#EBEBEB'
WHERE page_color = '#A77C8A';

UPDATE books
SET page_color = '#F7F2E7'
WHERE page_color = '#6F7F72';

ALTER TABLE books
DROP CONSTRAINT IF EXISTS books_accent_color_check;

ALTER TABLE books
DROP CONSTRAINT IF EXISTS books_page_color_check;

ALTER TABLE books
ADD CONSTRAINT books_accent_color_check
CHECK (accent_color IN (
  '#E4C0FF',
  '#FFE566',
  '#FF6B6B',
  '#7DF9AA',
  '#87CEEB',
  '#FFB347',
  '#FFC7D6',
  '#CFF2BE',
  '#EBEBEB',
  '#F7F2E7'
));

ALTER TABLE books
ADD CONSTRAINT books_page_color_check
CHECK (page_color IN (
  '#E4C0FF',
  '#FFE566',
  '#FF6B6B',
  '#7DF9AA',
  '#87CEEB',
  '#FFB347',
  '#FFC7D6',
  '#CFF2BE',
  '#EBEBEB',
  '#F7F2E7'
));
