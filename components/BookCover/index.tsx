import { BookCoverProps } from './types';
import BrutalistCover from './BrutalistCover';
import ClassicCover from './ClassicCover';
import FilmCover from './FilmCover';

export default function BookCover(props: BookCoverProps) {
  switch (props.theme) {
    case 'brutalist':
      return <BrutalistCover {...props} />;
    case 'film':
      return <FilmCover {...props} />;
    case 'classic':
    default:
      return <ClassicCover {...props} />;
  }
}

export * from './types';
