import LegalDocumentScreen from '../components/LegalDocumentScreen';

export default function TermsScreen(props) {
  return <LegalDocumentScreen {...props} route={{ ...props.route, params: { doc: 'terms', ...props.route?.params } }} />;
}
