UPDATE books
SET accent_color = CASE accent_color
  WHEN '#FF6B6B' THEN '#F7D3E1'
  WHEN '#FFC7D6' THEN '#F7D3E1'
  WHEN '#A77C8A' THEN '#F7D3E1'
  WHEN '#7DF9AA' THEN '#9BF0B0'
  WHEN '#CFF2BE' THEN '#9BF0B0'
  WHEN '#87CEEB' THEN '#8EC9DF'
  WHEN '#FFB347' THEN '#FFE566'
  WHEN '#EBEBEB' THEN '#F7F2E7'
  WHEN '#6F7F72' THEN '#F7F2E7'
  ELSE accent_color
END
WHERE accent_color IN (
  '#FF6B6B',
  '#FFC7D6',
  '#A77C8A',
  '#7DF9AA',
  '#CFF2BE',
  '#87CEEB',
  '#FFB347',
  '#EBEBEB',
  '#6F7F72'
);

UPDATE books
SET page_color = CASE page_color
  WHEN '#FF6B6B' THEN '#F7D3E1'
  WHEN '#FFC7D6' THEN '#F7D3E1'
  WHEN '#A77C8A' THEN '#F7D3E1'
  WHEN '#7DF9AA' THEN '#9BF0B0'
  WHEN '#CFF2BE' THEN '#9BF0B0'
  WHEN '#87CEEB' THEN '#8EC9DF'
  WHEN '#FFB347' THEN '#FFE566'
  WHEN '#EBEBEB' THEN '#F7F2E7'
  WHEN '#6F7F72' THEN '#F7F2E7'
  ELSE page_color
END
WHERE page_color IN (
  '#FF6B6B',
  '#FFC7D6',
  '#A77C8A',
  '#7DF9AA',
  '#CFF2BE',
  '#87CEEB',
  '#FFB347',
  '#EBEBEB',
  '#6F7F72'
);

ALTER TABLE books
DROP CONSTRAINT IF EXISTS books_accent_color_check;

ALTER TABLE books
DROP CONSTRAINT IF EXISTS books_page_color_check;

ALTER TABLE books
ADD CONSTRAINT books_accent_color_check
CHECK (accent_color IN (
  '#F7D3E1',
  '#F2E8FF',
  '#E4C0FF',
  '#FFE566',
  '#9BF0B0',
  '#8EC9DF',
  '#F7F2E7'
));

ALTER TABLE books
ADD CONSTRAINT books_page_color_check
CHECK (page_color IN (
  '#F7D3E1',
  '#F2E8FF',
  '#E4C0FF',
  '#FFE566',
  '#9BF0B0',
  '#8EC9DF',
  '#F7F2E7'
));
