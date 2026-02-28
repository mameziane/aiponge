import { useContext } from 'react';
import { LibrarianCreateContext } from './_layout';
import LibrarianMusicScreen from '../../src/screens/librarian/MusicScreen';

export default function LibrarianLibraryTab() {
  const { musicCreationTrigger } = useContext(LibrarianCreateContext);

  return <LibrarianMusicScreen externalCreateTrigger={musicCreationTrigger} />;
}
