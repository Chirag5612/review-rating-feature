import mongoose, { model, Schema } from 'mongoose';

export interface IRatingModel {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  venue_id: mongoose.Types.ObjectId;
  booking_id: mongoose.Types.ObjectId;
  rating: number;
  review: string;
}

const schema = new Schema<IRatingModel>({
  user_id: { type: Schema.Types.Mixed },
  booking_id: { type: Schema.Types.ObjectId},
  venue_id: { type: Schema.Types.ObjectId },
  rating: { type: Number, comments: 'Rating should be from 1 to 5'},
  review: { type: String, comments: 'Write you review here', default: ''},
}, {
  timestamps: true,
});

const RatingModel = model('ratings', schema);

export default RatingModel;
