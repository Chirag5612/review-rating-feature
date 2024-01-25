import { Response } from "express";
import mongoose from "mongoose";
import log4js from "log4js";
import response from "../../helper/responseMiddleware";
import BookingVenue from "../../models/booking-venue-model";
import ReviewModel from "../../models/rating-model";
import VenueModel from "../../models/venue-model";

const logger = log4js.getLogger();

/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ============================================= Create/store Rating service ==========================================
/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const store = async (req: any, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const user_id = req.user._id;
    const { booking_id, venue_id, rating, review } = req.body;

    const exist = await ReviewModel.exists({ booking_id: booking_id });

    if (exist) {
      const responseData: any = {
        message: `Review already submitted`,
        data: exist._id
      };
      return await response.sendError(res, responseData);
    }

    const bookingDetails = await BookingVenue.findOne({ _id: new mongoose.Types.ObjectId(booking_id), venue_id: new mongoose.Types.ObjectId(venue_id) })

    if (!bookingDetails) {
      const responseData: any = {
        message: "Provide a vaild Booking Id",
      };
      return await response.sendError(res, responseData);
    }

    if (bookingDetails) {
      const startTime = new Date(bookingDetails.start_date)
      const currentDate = new Date();

      if (startTime > currentDate) {
        const responseData: any = {
          message: "Not able to Rate now",
        };
        return await response.sendError(res, responseData);
      }

    }

    let reviewDataStore: any = {};
    let message: any;

    reviewDataStore = new ReviewModel();
    message = `Review Added Successfully`;

    reviewDataStore.user_id = new mongoose.Types.ObjectId(user_id);
    reviewDataStore.venue_id = new mongoose.Types.ObjectId(venue_id);
    reviewDataStore.rating = Number(rating);
    reviewDataStore.review = review;
    reviewDataStore.booking_id = booking_id;

    await reviewDataStore.save();

    const venueDetails = await VenueModel.findById(venue_id);

    if (venueDetails) {
      const newTotalRatings = Number(venueDetails.totalRatings + 1)
      const reviewMatchStage = {
        $match: {
          $and: [
            venue_id !== undefined ? { venue_id: new mongoose.Types.ObjectId(venue_id) } : {},
          ],
        }
      }

      const reviewPipeline: any[] = [
        reviewMatchStage,
      ]

      // fetch all reviews of venue
      let reviews = await ReviewModel.aggregate(reviewPipeline).exec();
      let avgReviews = 0;

      if (reviews?.length != 0) {

        // calculate average of reviews
        for (let index = 0; index < reviews.length; index++) {
          const element = reviews[index];
          avgReviews += element.rating
        }

        avgReviews = avgReviews / reviews.length
      }
      venueDetails.rating = Number(avgReviews);
      venueDetails.totalRatings = Number(newTotalRatings);

      // Update total rating field in document
      VenueModel.updateOne({ _id: venue_id }, venueDetails, function (err: any, result: any) {
        if (err) {
          logger.info(err)
        }
      });
    }

    await session.commitTransaction();
    await session.endSession();
    const responseData = {
      message,
      data: reviewDataStore,
    };
    return await response.sendSuccess(req, res, responseData);
  } catch (err: any) {
    const sendResponse: any = {
      message: err.message,
    };
    logger.info(err.message);
    logger.info(err);
    await session.abortTransaction();
    session.endSession();
    return response.sendError(res, sendResponse);
  }
};

const getRatings = async (req: any, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let { venue_id, page = 1, limit = 10 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(venue_id)) {
      const responseData: any = {
        message: "Provide a vaild venue Id",
      };
      return await response.sendError(res, responseData);
    }

    const venueData = await VenueModel.findById(new mongoose.Types.ObjectId(venue_id));

    if (!venueData) {
      const responseData: any = {
        message: "Provide a vaild venue Id",
      };
      return await response.sendError(res, responseData);
    }

    const matchStage = {
      $match: {
        $and: [
          venue_id !== undefined ? { venue_id: new mongoose.Types.ObjectId(venue_id) } : {},
        ],
      }
    }

    const userLookupStage = {
      $lookup: {
        from: "users", // The name of the collection you're joining with
        localField: "user_id", // The field in the Venue document
        foreignField: "_id", // The field in the SportType document
        as: "userData", // The field name to store the joined data
      },
    }

    const unwindUserDataStage = {
      $unwind: "$userData",
    };

    const pipeline2: any[] = [
      matchStage,
      userLookupStage,
      unwindUserDataStage,
    ]

    const projection = {
      _id: 1,
      review: 1,
      user_id: 1,
      venue_id: 1,
      rating: 1,
      createdAt: 1,
      "userData._id": 1,
      "userData.full_name": 1,
      "userData.profile_photo": 1,
    };

    let allReviews = await ReviewModel.aggregate(pipeline2).exec();

    const projectStage = {
      $project: projection,
    };

    const facetStage = {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    };

    const pipeline: any[] = [
      matchStage,
      userLookupStage,
      unwindUserDataStage,
      projectStage,
      facetStage,
    ]

    limit = parseInt(limit);

    let reviews = await ReviewModel.aggregate(pipeline).exec();
    reviews = JSON.parse(JSON.stringify(reviews));

    let totalPages = 0;
    let avgReviews = 0;

    if (allReviews?.length != 0) {

      for (let index = 0; index < allReviews.length; index++) {
        const element = allReviews[index];
        avgReviews += element.rating
      }

      avgReviews = avgReviews / allReviews.length
    }

    let sendResponse: any;
    const data = {
      rating: avgReviews ? avgReviews.toFixed(1) : avgReviews,
      totalReviews: allReviews.length,
      data: reviews[0].data,
    }
    if (reviews[0].data.length > 0) {
      sendResponse = {
        code: 200,
        status: "success",
        message: process.env.APP_GET_MESSAGE,
        total_pages: totalPages,
        total: reviews[0].total[0].count,
        data: data,
      };
    } else {
      sendResponse = {
        code: 200,
        status: "success",
        message: "No data found",
        total_pages: totalPages,
        total: 0,
        data: [],
      };
    }
    await session.commitTransaction();
    session.endSession();
    return res.status(200).send(sendResponse);
  } catch (err: any) {
    const sendResponse: any = {
      message: err.message,
    };
    logger.info(err.message);
    logger.info(err);
    await session.abortTransaction();
    session.endSession();
    return response.sendError(res, sendResponse);
  }
}

export default {
  store,
  getRatings
};
